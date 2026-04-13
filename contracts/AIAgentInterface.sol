// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AIAgentInterface is Ownable {

    struct AIRiskResult {
        uint256 collateralPercent; // e.g. 18 = 18%
        uint8   riskLevel;         // 0=LOW 1=MEDIUM 2=HIGH 3=CRITICAL
        bool    fraudFlag;
        string  riskSummary;       // short human readable text
        uint256 respondedAt;
    }

    struct AITemplateResult {
        string  dealType;
        string  title;
        uint256 suggestedCollateralPct;
        uint256 gracePeriodHours;
        bool    fulfilled;
        uint256 respondedAt;
    }

    mapping(uint256 => AIRiskResult)     public riskResults;
    mapping(uint256 => AITemplateResult) public templateResults;

    address public aiRelayer;

    event CollateralRequested(uint256 indexed dealId, uint256 amountWei, uint256 buyerScore, uint256 sellerScore);
    event CollateralFulfilled(uint256 indexed dealId, uint256 collateralPct, uint8 riskLevel, bool fraudFlag);
    event TemplateRequested(uint256 indexed requestId, string description);
    event TemplateFulfilled(uint256 indexed requestId, string dealType, uint256 collateralPct);

    constructor() Ownable(msg.sender) {}

    function setAIRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer");
        aiRelayer = _relayer;
    }

    modifier onlyAIRelayer() {
        require(msg.sender == aiRelayer, "Only AI relayer can call this");
        _;
    }

    // Frontend calls this to request collateral suggestion
    // AI service listens for this event and responds via fulfillCollateral
    function requestCollateral(
        uint256 dealId,
        uint256 amountWei,
        uint256 buyerScore,
        uint256 sellerScore
    ) external {
        emit CollateralRequested(dealId, amountWei, buyerScore, sellerScore);
    }

    // ── AI relayer calls this with the computed result ──
    function fulfillCollateral(
        uint256 dealId,
        uint256 collateralPercent,
        uint8   riskLevel,
        bool    fraudFlag,
        string calldata riskSummary
    ) external onlyAIRelayer {
        require(collateralPercent >= 5 && collateralPercent <= 50, "Invalid collateral %");
        require(riskLevel <= 3, "Invalid risk level");


        riskResults[dealId] = AIRiskResult({
            collateralPercent: collateralPercent,
            riskLevel:         riskLevel,
            fraudFlag:         fraudFlag,
            riskSummary:       riskSummary,
            respondedAt:       block.timestamp
        });

        emit CollateralFulfilled(dealId, collateralPercent, riskLevel, fraudFlag);
    }

    // Frontend calls this to generate deal template from description
    function requestTemplate(uint256 requestId, string calldata description) external {
        emit TemplateRequested(requestId, description);
    }

    // AI relayer fulfills template request
    function fulfillTemplate(
        uint256 requestId,
        string calldata dealType,
        string calldata title,
        uint256 suggestedCollateralPct,
        uint256 gracePeriodHours
    ) external onlyAIRelayer {
        templateResults[requestId] = AITemplateResult({
            dealType:              dealType,
            title:                 title,
            suggestedCollateralPct: suggestedCollateralPct,
            gracePeriodHours:      gracePeriodHours,
            fulfilled:             true,
            respondedAt:           block.timestamp
        });

        emit TemplateFulfilled(requestId, dealType, suggestedCollateralPct);
    }

    // View functions 
    function getRiskResult(uint256 dealId) external view returns (AIRiskResult memory) {
        return riskResults[dealId];
    }

    function getTemplateResult(uint256 requestId) external view returns (AITemplateResult memory) {
        return templateResults[requestId];
    }

    function hasRiskResult(uint256 dealId) external view returns (bool) {
        return riskResults[dealId].respondedAt > 0;
    }
}
