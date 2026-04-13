// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Note: If using OpenZeppelin v5.x, the import path for ReentrancyGuard is "@openzeppelin/contracts/utils/ReentrancyGuard.sol"
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

// --- Required Interfaces --- //
interface IDIDRegistry {
    function getPakkaScore(address _user) external view returns (uint256);
    function updatePakkaScore(address _user, uint256 _newScore) external;
    function incrementDealsCompleted(address _user) external;
    function incrementDealsDefaulted(address _user) external;
    function incrementDealsDisputed(address _user) external;
}

interface IArbitratorRegistry {
    enum Vote { NONE, BUYER, SELLER, SPLIT }
    function countVotesAndResolve(uint256 dealId) external returns (Vote);
}

interface IAIAgentInterface {
    function requestCollateral(uint256 dealId, uint256 amount, uint256 buyerScore) external;
    function dealCollateralPercentage(uint256 dealId) external view returns (uint256);
}

/**
 * @title EscrowVault
 * @author Pakka Deal
 * @notice Highly secure singleton escrow contract handling all deals securely without deploying 
 *         expensive sub-contracts per deal. 
 * @dev Defends against reentrancy and enforces state security. Integrates ERC2771 for gasless 
 *      meta-transactions via a trusted forwarder (Biconomy, OpenGSN, etc.).
 */
contract EscrowVault is ERC2771Context, ReentrancyGuard {
    // --- Custom Errors --- //
    error ArrayMismatch();
    error Unauthorized();
    error InvalidState();
    error IncorrectValue();
    error AlreadyFunded();
    error BuyerNotFunded();
    error AllMilestonesCompleted();
    error TransferFailed();
    error VerdictNotReached();

    // --- Enums --- //
    enum DealType { CAR, PROPERTY, FREELANCE, PSL_FRANCHISE, PSL_PLAYER, MARKETPLACE, CUSTOM }
    enum DealState { PENDING, LOCKED, COMPLETED, DEFAULTED, DISPUTED, CLOSED }

    // --- Structs --- //
    struct Deal {
        DealType dealType;
        DealState state;
        address payable buyer;
        address payable seller;
        uint256 totalAmount;
        uint256 sellerBond;
        uint256 milestoneCount;
        uint256 currentMilestone;
        uint256[] milestoneAmounts;
        uint256 gracePeriodEnd;
        bool disputed;
        bool buyerFunded;
        bool sellerFunded;
        string buyerEvidence;
        string sellerEvidence;
    }

    // --- State Variables --- //
    IDIDRegistry public didRegistry;
    IArbitratorRegistry public arbitratorRegistry;
    IAIAgentInterface public aiAgentInterface;

    uint256 public dealCounter;
    mapping(uint256 => Deal) public deals;

    // --- Events --- //
    event DealCreated(uint256 indexed dealId, address indexed buyer, address indexed seller, uint256 totalAmount);
    event DealStateChanged(uint256 indexed dealId, DealState newState);
    event BuyerFundsLocked(uint256 indexed dealId, uint256 amount);
    event SellerBondLocked(uint256 indexed dealId, uint256 amount);
    event MilestoneConfirmed(uint256 indexed dealId, uint256 milestoneIndex, uint256 amount);
    event DisputeRaised(uint256 indexed dealId, address raisedBy);
    event EvidenceSubmitted(uint256 indexed dealId, address submitter, string cid);
    event DealResolved(uint256 indexed dealId, IArbitratorRegistry.Vote verdict);

    // --- Constructor --- //
    constructor(
        address trustedForwarder,
        address _didRegistry,
        address _arbitratorRegistry,
        address _aiAgentInterface
    ) ERC2771Context(trustedForwarder) {
        didRegistry = IDIDRegistry(_didRegistry);
        arbitratorRegistry = IArbitratorRegistry(_arbitratorRegistry);
        aiAgentInterface = IAIAgentInterface(_aiAgentInterface);
    }

    // --- Core Methods --- //

    /**
     * @notice Creates a new deal directly mapping to a storage slot (Singleton methodology).
     * @param _dealType Enum representing the category of the deal.
     * @param _seller The seller's payable address.
     * @param _totalAmount The total amount configured for the core transaction.
     * @param _milestoneAmounts An exact array defining how chunks are paid per milestone.
     */
    function createDeal(
        DealType _dealType,
        address payable _seller,
        uint256 _totalAmount,
        uint256[] memory _milestoneAmounts
    ) external returns (uint256) {
        // Enforce strong arithmetic correlation
        uint256 sum = 0;
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            sum += _milestoneAmounts[i];
        }
        if (sum != _totalAmount) revert ArrayMismatch();

        dealCounter++;
        uint256 newDealId = dealCounter;

        Deal storage deal = deals[newDealId];
        deal.dealType = _dealType;
        deal.state = DealState.PENDING;
        deal.buyer = payable(_msgSender()); // Use _msgSender() for meta-tx compatibility
        deal.seller = _seller;
        deal.totalAmount = _totalAmount;
        deal.milestoneCount = _milestoneAmounts.length;
        deal.milestoneAmounts = _milestoneAmounts;
        
        emit DealCreated(newDealId, _msgSender(), _seller, _totalAmount);
        return newDealId;
    }

    /**
     * @notice Allows the Buyer to lock their 100% committed funds into the vault.
     * @param dealId The unique identifier of the target deal.
     */
    function lockBuyerFunds(uint256 dealId) external payable nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.state != DealState.PENDING) revert InvalidState();
        if (_msgSender() != deal.buyer) revert Unauthorized();
        if (msg.value != deal.totalAmount) revert IncorrectValue();
        if (deal.buyerFunded) revert AlreadyFunded();

        deal.buyerFunded = true;
        emit BuyerFundsLocked(dealId, msg.value);
    }

    /**
     * @notice The Seller locks their 20% security bond to initiate and transition the deal state to LOCKED.
     * @param dealId The unique identifier of the target deal.
     */
    function lockSellerBond(uint256 dealId) external payable nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.state != DealState.PENDING) revert InvalidState();
        if (!deal.buyerFunded) revert BuyerNotFunded();
        if (_msgSender() != deal.seller) revert Unauthorized();
        if (deal.sellerFunded) revert AlreadyFunded();

        // 20% Hardcoded bond for extreme hackathon safety
        // Off-chain AI can theoretically inform variations, but we enforce fixed baseline parameters here
        uint256 requiredBond = (deal.totalAmount * 20) / 100;
        if (msg.value != requiredBond) revert IncorrectValue();

        deal.sellerFunded = true;
        deal.sellerBond = msg.value;
        deal.state = DealState.LOCKED;
        
        emit SellerBondLocked(dealId, msg.value);
        emit DealStateChanged(dealId, DealState.LOCKED);
    }

    /**
     * @notice Progresses milestones, paying out fractions to the Seller upon successful mutual progression.
     * @param dealId The unique identifier of the target deal.
     */
    function confirmMilestone(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.state != DealState.LOCKED) revert InvalidState();
        if (_msgSender() != deal.buyer) revert Unauthorized();
        if (deal.currentMilestone >= deal.milestoneCount) revert AllMilestonesCompleted();

        uint256 amountToRelease = deal.milestoneAmounts[deal.currentMilestone];
        deal.currentMilestone++;

        if (deal.currentMilestone == deal.milestoneCount) {
            deal.state = DealState.COMPLETED;
            uint256 totalToSend = amountToRelease + deal.sellerBond;
            
            // Interaction with DIDRegistry natively to boost reputation of reliable actors
            didRegistry.incrementDealsCompleted(deal.buyer);
            didRegistry.incrementDealsCompleted(deal.seller);

            (bool success, ) = deal.seller.call{value: totalToSend}("");
            if (!success) revert TransferFailed();
            
            emit DealStateChanged(dealId, DealState.COMPLETED);
        } else {
            (bool success, ) = deal.seller.call{value: amountToRelease}("");
            if (!success) revert TransferFailed();
        }
        
        emit MilestoneConfirmed(dealId, deal.currentMilestone - 1, amountToRelease);
    }

    /**
     * @notice Raises a conflict resulting in funds freezing until Arbitrators step in.
     * @param dealId The unique identifier of the target deal.
     */
    function raiseDispute(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        if (deal.state != DealState.LOCKED) revert InvalidState();
        if (_msgSender() != deal.buyer && _msgSender() != deal.seller) revert Unauthorized();

        deal.disputed = true;
        deal.state = DealState.DISPUTED;

        emit DisputeRaised(dealId, _msgSender());
        emit DealStateChanged(dealId, DealState.DISPUTED);
    }

    /**
     * @notice Safely stores verifiable credentials or attachments by referencing IPFS CIDs on-chain.
     * @param dealId The unique identifier of the target deal.
     * @param cid Formatted IPFS Content Identifier.
     */
    function submitEvidence(uint256 dealId, string memory cid) external {
        Deal storage deal = deals[dealId];
        if (deal.state != DealState.DISPUTED) revert InvalidState();
        
        if (_msgSender() == deal.buyer) {
            deal.buyerEvidence = cid;
        } else if (_msgSender() == deal.seller) {
            deal.sellerEvidence = cid;
        } else {
            revert Unauthorized();
        }

        emit EvidenceSubmitted(dealId, _msgSender(), cid);
    }

    /**
     * @notice Evaluates Arbitrator Registry responses, processes punitive score deductions, and forces a resolution.
     * @param dealId The unique identifier of the target deal.
     */
    function resolveDispute(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.state != DealState.DISPUTED) revert InvalidState();

        // 1. Interactions -> Check registry dynamically
        IArbitratorRegistry.Vote verdict = arbitratorRegistry.countVotesAndResolve(dealId);
        if (verdict == IArbitratorRegistry.Vote.NONE) revert VerdictNotReached();

        // Accumulate exactly what remains locked up natively
        uint256 releasedAmount = 0;
        for (uint256 i = 0; i < deal.currentMilestone; i++) {
            releasedAmount += deal.milestoneAmounts[i];
        }
        uint256 remainingAmount = deal.totalAmount - releasedAmount;
        uint256 bondSnapshot = deal.sellerBond;

        // 2. CEI - State Effects
        deal.sellerBond = 0; 
        deal.state = DealState.CLOSED;

        didRegistry.incrementDealsDisputed(deal.buyer);
        didRegistry.incrementDealsDisputed(deal.seller);

        // 3. Extrinsic Interaction Routing based on the Verdict
        if (verdict == IArbitratorRegistry.Vote.BUYER) {
            
            // Penalize the Seller
            didRegistry.incrementDealsDefaulted(deal.seller);
            _punishScore(deal.seller, 50);

            // Refund Buyer everything left PLUS construct extreme punitive measures against Seller 
            // by awarding the Buyer the Seller's 20% collateral bond.
            uint256 toBuyer = remainingAmount + bondSnapshot;
            (bool success, ) = deal.buyer.call{value: toBuyer}("");
            if (!success) revert TransferFailed();

        } else if (verdict == IArbitratorRegistry.Vote.SELLER) {
            
            // Penalize the Buyer (Malicious reporting etc.)
            didRegistry.incrementDealsDefaulted(deal.buyer);
            _punishScore(deal.buyer, 50);

            // Confiscate remaining Buyer funds and route to the Seller + explicitly return their untouched bond.
            uint256 toSeller = remainingAmount + bondSnapshot;
            (bool success, ) = deal.seller.call{value: toSeller}("");
            if (!success) revert TransferFailed();

        } else if (verdict == IArbitratorRegistry.Vote.SPLIT) {
            
            // Neutral resolution scenario
            bool ok1 = true;
            bool ok2 = true;
            if (remainingAmount > 0) {
                (ok1, ) = deal.buyer.call{value: remainingAmount}("");
            }
            if (bondSnapshot > 0) {
                (ok2, ) = deal.seller.call{value: bondSnapshot}("");
            }
            if (!ok1 || !ok2) revert TransferFailed();
        }

        emit DealResolved(dealId, verdict);
        emit DealStateChanged(dealId, DealState.CLOSED);
    }
    
    /**
     * @dev Internal helper bridging to the DIDRegistry protecting mathematically against underflow.
     */
    function _punishScore(address user, uint256 deduction) internal {
        uint256 score = didRegistry.getPakkaScore(user);
        if (score > deduction) {
            didRegistry.updatePakkaScore(user, score - deduction);
        } else {
            didRegistry.updatePakkaScore(user, 0); // Floor it strictly to 0
        }
    }
}
