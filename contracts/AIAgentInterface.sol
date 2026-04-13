// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AIAgentInterface
 * @author Pakka Deal
 * @notice Acts as an on-chain bridge to request off-chain AI analysis from a Node.js engine.
 * @dev Implements a secure request/fulfill pattern where only the AI's controlled wallet (owner) 
 *      can fulfill requests. Optimized for minimal gas consumption.
 */
contract AIAgentInterface is Ownable {
    // --- Custom Errors --- //
    error AmountCannotBeZero();
    error InvalidPercentage();

    // --- State Variables --- //
    /// @notice Maps a dealId to its AI-suggested collateral percentage (0-100)
    mapping(uint256 => uint256) public dealCollateralPercentage;

    // --- Events --- //
    /**
     * @notice Emitted when the escrow requires an AI risk analysis on collateral payload.
     * @dev The Node.js AI Engine listens to this event to trigger inference.
     */
    event CollateralRequested(uint256 indexed dealId, uint256 amount, uint256 buyerScore);
    
    /**
     * @notice Emitted when the off-chain AI responds with the required collateralization percentage.
     */
    event CollateralFulfilled(uint256 indexed dealId, uint256 collateralPercentage);

    /**
     * @dev Ownable sets the deployer, effectively the AI engine's operational wallet, as owner.
     */
    constructor() Ownable(msg.sender) {}

    // --- Core Functions --- //
    /**
     * @notice Emits a request for the AI to calculate required collateral dynamically.
     * @param dealId The unique identifier of the deal.
     * @param amount The transaction volume/amount involved.
     * @param buyerScore The "Pakka Score" of the buyer.
     */
    function requestCollateral(uint256 dealId, uint256 amount, uint256 buyerScore) external {
        if (amount == 0) revert AmountCannotBeZero();
        
        // Emitting the event for off-chain indexing by Node.js server
        emit CollateralRequested(dealId, amount, buyerScore);
    }

    /**
     * @notice Fulfills the AI collateral request by writing the AI's calculation on-chain.
     * @dev Restricted strictly to the AI server wallet (owner) to prevent manipulation.
     * @param dealId The unique identifier of the deal.
     * @param collateralPercentage The generated collateral percentage (e.g., 0-100).
     */
    function fulfillCollateral(uint256 dealId, uint256 collateralPercentage) external onlyOwner {
        if (collateralPercentage > 100) revert InvalidPercentage();

        dealCollateralPercentage[dealId] = collateralPercentage;
        
        emit CollateralFulfilled(dealId, collateralPercentage);
    }
}
