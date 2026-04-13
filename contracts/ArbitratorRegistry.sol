// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArbitratorRegistry
 * @author Pakka Deal
 * @notice Manages a dispute panel using 3 hardcoded team wallet addresses handling votes.
 * @dev Extremely gas optimized via tight struct packing, ensuring single-slot reads/writes.
 */
contract ArbitratorRegistry is Ownable {
    // --- Custom Errors --- //
    error UnauthorizedArbitrator();
    error AlreadyVoted();
    error InvalidVote();
    error VerdictAlreadyReached();
    error InsufficientVotes();

    // --- Enums & Structs --- //
    /// @notice Possible outcomes of an arbitrator's vote
    enum Vote { NONE, BUYER, SELLER, SPLIT }

    /**
     * @dev Struct storing votes and verdict closely packed into a single 32-byte storage slot.
     * Enums inherit uint8 scaling under the hood, so all 4 fields consume just 4 bytes total.
     */
    struct DealState {
        Vote arb1Vote;
        Vote arb2Vote;
        Vote arb3Vote;
        Vote verdict;
    }

    // --- State Variables --- //
    // Hackathon configuration: 3 hardcoded team wallet addresses (Arbitrators)
    // Developers: Replace these addresses prior to actual deployment.
    address public constant VALID_ARB_1 = 0x1111111111111111111111111111111111111111;
    address public constant VALID_ARB_2 = 0x2222222222222222222222222222222222222222;
    address public constant VALID_ARB_3 = 0x3333333333333333333333333333333333333333;

    /// @notice Maps a dealId to the packed state of its dispute resolution
    mapping(uint256 => DealState) public dealStates;

    // --- Events --- //
    event VoteCast(uint256 indexed dealId, address indexed arbitrator, Vote vote);
    event VerdictReached(uint256 indexed dealId, Vote verdict);

    // --- Constructor & Modifiers --- //
    constructor() Ownable(msg.sender) {}

    modifier onlyArbitrator() {
        if (msg.sender != VALID_ARB_1 && msg.sender != VALID_ARB_2 && msg.sender != VALID_ARB_3) {
            revert UnauthorizedArbitrator();
        }
        _;
    }

    // --- Core Functions --- //
    /**
     * @notice Records an arbitrator's vote for a specific dispute.
     * @param dealId The unique ID of the disputed deal.
     * @param vote The arbitrator's selected resolution (BUYER, SELLER, or SPLIT).
     */
    function recordVote(uint256 dealId, Vote vote) external onlyArbitrator {
        if (vote == Vote.NONE) revert InvalidVote();
        
        // Single SLOAD to pull all states into memory (saves massive gas)
        DealState memory state = dealStates[dealId];
        
        if (state.verdict != Vote.NONE) revert VerdictAlreadyReached();
        
        // Map caller to their respective vote slot
        if (msg.sender == VALID_ARB_1) {
            if (state.arb1Vote != Vote.NONE) revert AlreadyVoted();
            state.arb1Vote = vote;
        } else if (msg.sender == VALID_ARB_2) {
            if (state.arb2Vote != Vote.NONE) revert AlreadyVoted();
            state.arb2Vote = vote;
        } else { // Implicitly VALID_ARB_3 because of modifier rules
            if (state.arb3Vote != Vote.NONE) revert AlreadyVoted();
            state.arb3Vote = vote;
        }

        // Single SSTORE writes it back to storage
        dealStates[dealId] = state;
        
        emit VoteCast(dealId, msg.sender, vote);
    }

    /**
     * @notice Counts votes to finalize a verdict (Requires a Majority of 3).
     * @param dealId The unique ID of the disputed deal.
     * @return The final reached verdict.
     */
    function countVotesAndResolve(uint256 dealId) external returns (Vote) {
        // Single SLOAD to memory
        DealState memory state = dealStates[dealId];
        
        if (state.verdict != Vote.NONE) {
            return state.verdict; // Verdict already firmly established
        }

        // Count tallies locally to defer logic mapping
        uint8 totalVotes = 0;
        if (state.arb1Vote != Vote.NONE) totalVotes++;
        if (state.arb2Vote != Vote.NONE) totalVotes++;
        if (state.arb3Vote != Vote.NONE) totalVotes++;
        
        if (totalVotes < 2) revert InsufficientVotes(); // Mathematically impossible to have a majority

        Vote finalVerdict = Vote.NONE;

        // Check for majority alignment (at least 2 matching votes)
        if (state.arb1Vote == state.arb2Vote && state.arb1Vote != Vote.NONE) {
            finalVerdict = state.arb1Vote;
        } else if (state.arb1Vote == state.arb3Vote && state.arb1Vote != Vote.NONE) {
            finalVerdict = state.arb1Vote;
        } else if (state.arb2Vote == state.arb3Vote && state.arb2Vote != Vote.NONE) {
            finalVerdict = state.arb2Vote;
        } else if (totalVotes == 3) {
            // Tie breaker logic: 3 completely different votes (1 BUYER, 1 SELLER, 1 SPLIT)
            // It defaults securely to SPLIT when an absolute consensus cannot be reached
            finalVerdict = Vote.SPLIT;
        } else {
            // Edge case: 2 distinctly different votes exist so far, we need the 3rd to break a tie
            revert InsufficientVotes();
        }

        // Apply state mutation locally then flush to storage via single SSTORE
        state.verdict = finalVerdict;
        dealStates[dealId] = state;
        
        emit VerdictReached(dealId, finalVerdict);
        return finalVerdict;
    }
}
