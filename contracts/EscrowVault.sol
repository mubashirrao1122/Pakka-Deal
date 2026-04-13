// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

interface IDIDRegistry {
    function incrementScore(address user) external;
    function decrementScore(address user) external;
    function isVerified(address user) external view returns (bool);
}

contract EscrowVault is ReentrancyGuard, Ownable, ERC2771Context {

    enum DealType  { CAR, PROPERTY, FREELANCE, PSL_FRANCHISE, PSL_PLAYER, MARKETPLACE, CUSTOM }
    enum DealState { PENDING, LOCKED, COMPLETED, DEFAULTED, DISPUTED, CLOSED }
    enum Vote      { NONE, BUYER, SELLER, SPLIT }

    struct Milestone {
        string  label;
        uint256 amount;
        bool    completed;
    }

    struct Deal {
        uint256   id;
        DealType  dealType;
        DealState state;
        address payable buyer;
        address payable seller;
        uint256  totalAmount;
        uint256  sellerBond;
        uint256  gracePeriodEnd;
        bool     disputed;
        string   buyerEvidence;
        string   sellerEvidence;
        uint8    currentMilestone;
        uint8    milestoneCount;
        uint256  createdAt;
    }

    mapping(uint256 => Deal)           public deals;
    mapping(uint256 => Milestone[])    public milestones;
    mapping(uint256 => address[3])     public arbitrators;
    mapping(uint256 => Vote[3])        public votes;
    mapping(uint256 => uint8)          public voteCount;

    uint256 public dealCounter;
    address public didRegistry;
    address public platformRelayer;

    event DealCreated(uint256 indexed id, address indexed seller, DealType dealType, uint256 sellerBond);
    event BuyerJoined(uint256 indexed id, address indexed buyer, uint256 amountLocked);
    event MilestoneReleased(uint256 indexed id, uint8 milestone, uint256 amount);
    event DealCompleted(uint256 indexed id);
    event DealDefaulted(uint256 indexed id, address defaulter);
    event DisputeRaised(uint256 indexed id, address raisedBy);
    event EvidenceSubmitted(uint256 indexed id, address party, string ipfsCID);
    event VoteCast(uint256 indexed id, address arbitrator, Vote vote);
    event DisputeResolved(uint256 indexed id, string outcome);

    constructor(address trustedForwarder, address _didRegistry, address _platformRelayer)
        ERC2771Context(trustedForwarder)
        Ownable(msg.sender)
    {
        didRegistry = _didRegistry;
        platformRelayer = _platformRelayer;
    }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    // ── Create Deal (Seller-First Flow) ──
    // Seller creates the deal and locks their collateral bond in one transaction.
    // Buyer joins later via joinAndLockFunds (directly or via platform relayer proxy).
    function createDeal(
        DealType        _dealType,
        uint256         _totalAmount,
        uint256         _collateralPercent,
        string[] calldata _milestoneLabels,
        uint256[] calldata _milestoneAmounts
    ) external payable nonReentrant returns (uint256 dealId) {
        require(_totalAmount > 0, "Amount must be > 0");
        require(_collateralPercent >= 5 && _collateralPercent <= 50, "Collateral 5-50%");
        require(_milestoneLabels.length == _milestoneAmounts.length, "Milestone mismatch");
        require(_milestoneLabels.length >= 1 && _milestoneLabels.length <= 4, "1-4 milestones only");

        uint256 expectedBond = (_totalAmount * _collateralPercent) / 100;
        require(msg.value == expectedBond, "Must send exact seller bond");

        uint256 sum = 0;
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            require(_milestoneAmounts[i] > 0, "Milestone amount must be > 0");
            sum += _milestoneAmounts[i];
        }
        require(sum == _totalAmount, "Milestones must sum to totalAmount");

        dealId = dealCounter++;

        deals[dealId] = Deal({
            id:               dealId,
            dealType:         _dealType,
            state:            DealState.PENDING,
            buyer:            payable(address(0)),
            seller:           payable(_msgSender()),
            totalAmount:      _totalAmount,
            sellerBond:       expectedBond,
            gracePeriodEnd:   0,
            disputed:         false,
            buyerEvidence:    "",
            sellerEvidence:   "",
            currentMilestone: 0,
            milestoneCount:   uint8(_milestoneLabels.length),
            createdAt:        block.timestamp
        });

        for (uint256 i = 0; i < _milestoneLabels.length; i++) {
            milestones[dealId].push(Milestone({
                label:     _milestoneLabels[i],
                amount:    _milestoneAmounts[i],
                completed: false
            }));
        }

        emit DealCreated(dealId, _msgSender(), _dealType, expectedBond);
    }

    // ── Join and Lock Buyer Funds (Fiat/Relayer Proxy) ──
    // Either the buyer themselves OR the platform relayer (after fiat payment
    // via JazzCash) can call this to lock the buyer's funds and activate the deal.
    function joinAndLockFunds(uint256 dealId, address payable _buyer) external payable nonReentrant {
        Deal storage deal = deals[dealId];
        require(deal.state == DealState.PENDING, "Deal not pending");
        require(deal.buyer == address(0), "Buyer already joined");
        require(_buyer != address(0), "Invalid buyer address");
        require(_buyer != deal.seller, "Buyer and seller cannot be same");
        require(msg.value == deal.totalAmount, "Must send exact deal amount");

        // Authorization: either the buyer directly or the platform relayer acting as proxy
        require(
            _msgSender() == _buyer || _msgSender() == platformRelayer,
            "Only buyer or platform relayer can lock funds"
        );

        deal.buyer          = _buyer;
        deal.state          = DealState.LOCKED;
        deal.gracePeriodEnd = block.timestamp + 72 hours;

        emit BuyerJoined(dealId, _buyer, msg.value);
    }

    // ── Confirm Milestone ──
    function confirmMilestone(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        require(_msgSender() == deal.buyer, "Only buyer can confirm");
        require(!deal.disputed, "Cannot confirm during dispute");
        require(deal.state == DealState.LOCKED, "Deal must be locked");

        uint8 current = deal.currentMilestone;
        require(current < deal.milestoneCount, "All milestones done");

        Milestone storage m = milestones[dealId][current];
        require(!m.completed, "Milestone already completed");

        m.completed = true;
        deal.currentMilestone++;

        // Reset grace period for next milestone
        deal.gracePeriodEnd = block.timestamp + 72 hours;

        // Transfer this milestone amount to seller
        (bool success, ) = deal.seller.call{value: m.amount}("");
        require(success, "Transfer to seller failed");

        emit MilestoneReleased(dealId, current, m.amount);

        // If all milestones done, close deal
        if (deal.currentMilestone == deal.milestoneCount) {
            deal.state = DealState.COMPLETED;

            // Return seller bond
            (bool bondReturn, ) = deal.seller.call{value: deal.sellerBond}("");
            require(bondReturn, "Bond return failed");

            emit DealCompleted(dealId);

            // Update Pakka Scores
            try IDIDRegistry(didRegistry).incrementScore(deal.buyer) {} catch {}
            try IDIDRegistry(didRegistry).incrementScore(deal.seller) {} catch {}
        }
    }

    // ── Apply Penalty (called after grace period expires) ──
    function applyPenalty(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        require(deal.state == DealState.LOCKED, "Deal must be locked");
        require(!deal.disputed, "Cannot penalize during dispute");
        require(block.timestamp > deal.gracePeriodEnd, "Grace period not expired");

        deal.state = DealState.DEFAULTED;

        // Send everything to seller (buyer's amount + seller's bond back)
        uint256 remaining = deal.totalAmount - _getMilestonesReleasedAmount(dealId);
        uint256 total     = remaining + deal.sellerBond;

        (bool success, ) = deal.seller.call{value: total}("");
        require(success, "Penalty transfer failed");

        emit DealDefaulted(dealId, deal.buyer);

        try IDIDRegistry(didRegistry).decrementScore(deal.buyer) {} catch {}
    }

    // ── Raise Dispute ──
    function raiseDispute(
        uint256 dealId,
        address arb1,
        address arb2,
        address arb3
    ) external {
        Deal storage deal = deals[dealId];
        require(
            _msgSender() == deal.buyer || _msgSender() == deal.seller,
            "Only deal parties can dispute"
        );
        require(!deal.disputed, "Already disputed");
        require(deal.state == DealState.LOCKED, "Deal must be locked");
        require(arb1 != address(0) && arb2 != address(0) && arb3 != address(0), "Invalid arbitrators");
        require(arb1 != deal.buyer && arb1 != deal.seller, "Arb1 cannot be deal party");
        require(arb2 != deal.buyer && arb2 != deal.seller, "Arb2 cannot be deal party");
        require(arb3 != deal.buyer && arb3 != deal.seller, "Arb3 cannot be deal party");

        deal.disputed = true;
        deal.state    = DealState.DISPUTED;

        arbitrators[dealId][0] = arb1;
        arbitrators[dealId][1] = arb2;
        arbitrators[dealId][2] = arb3;

        emit DisputeRaised(dealId, _msgSender());
    }

    // ── Submit Evidence ──
    function submitEvidence(uint256 dealId, string calldata ipfsCID) external {
        Deal storage deal = deals[dealId];
        require(deal.disputed, "No active dispute");
        require(bytes(ipfsCID).length > 0, "CID cannot be empty");

        if (_msgSender() == deal.buyer) {
            require(bytes(deal.buyerEvidence).length == 0, "Evidence already submitted");
            deal.buyerEvidence = ipfsCID;
        } else if (_msgSender() == deal.seller) {
            require(bytes(deal.sellerEvidence).length == 0, "Evidence already submitted");
            deal.sellerEvidence = ipfsCID;
        } else {
            revert("Not a party to this deal");
        }

        emit EvidenceSubmitted(dealId, _msgSender(), ipfsCID);
    }

    // ── Submit Arbitrator Vote ──
    function submitVote(uint256 dealId, Vote _vote) external nonReentrant {
        require(_vote != Vote.NONE, "Cannot vote NONE");
        Deal storage deal = deals[dealId];
        require(deal.disputed, "No active dispute");

        address[3] memory arbs = arbitrators[dealId];
        uint8 arbIndex = 3; // invalid default

        for (uint8 i = 0; i < 3; i++) {
            if (arbs[i] == _msgSender()) {
                arbIndex = i;
                break;
            }
        }

        require(arbIndex < 3, "Not an assigned arbitrator");
        require(votes[dealId][arbIndex] == Vote.NONE, "Already voted");

        votes[dealId][arbIndex] = _vote;
        voteCount[dealId]++;

        emit VoteCast(dealId, _msgSender(), _vote);

        if (voteCount[dealId] == 3) {
            _resolveDispute(dealId);
        }
    }

    // ── Internal: Resolve Dispute ──
    function _resolveDispute(uint256 dealId) internal {
        Deal storage deal = deals[dealId];

        Vote[3] memory v = votes[dealId];
        uint8 buyerVotes;
        uint8 sellerVotes;

        for (uint8 i = 0; i < 3; i++) {
            if (v[i] == Vote.BUYER)  buyerVotes++;
            if (v[i] == Vote.SELLER) sellerVotes++;
        }

        deal.state    = DealState.CLOSED;
        deal.disputed = false;

        uint256 remaining = deal.totalAmount - _getMilestonesReleasedAmount(dealId);

        if (buyerVotes >= 2) {
            // Buyer wins: refund + seller bond as compensation
            (bool r1, ) = deal.buyer.call{value: remaining}("");
            (bool r2, ) = deal.buyer.call{value: deal.sellerBond}("");
            require(r1 && r2, "Buyer win transfer failed");
            emit DisputeResolved(dealId, "BUYER");
            try IDIDRegistry(didRegistry).decrementScore(deal.seller) {} catch {}
        } else if (sellerVotes >= 2) {
            // Seller wins: gets remaining + bond back
            (bool r1, ) = deal.seller.call{value: remaining}("");
            (bool r2, ) = deal.seller.call{value: deal.sellerBond}("");
            require(r1 && r2, "Seller win transfer failed");
            emit DisputeResolved(dealId, "SELLER");
            try IDIDRegistry(didRegistry).decrementScore(deal.buyer) {} catch {}
        } else {
            // Split
            uint256 total = remaining + deal.sellerBond;
            uint256 half  = total / 2;
            (bool r1, ) = deal.buyer.call{value: half}("");
            (bool r2, ) = deal.seller.call{value: total - half}("");
            require(r1 && r2, "Split transfer failed");
            emit DisputeResolved(dealId, "SPLIT");
        }
    }

    // ── Internal Helper ──
    function _getMilestonesReleasedAmount(uint256 dealId) internal view returns (uint256 released) {
        Milestone[] storage ms = milestones[dealId];
        for (uint256 i = 0; i < ms.length; i++) {
            if (ms[i].completed) released += ms[i].amount;
        }
    }

    // ── View Functions ──
    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function getMilestones(uint256 dealId) external view returns (Milestone[] memory) {
        return milestones[dealId];
    }

    function getArbitrators(uint256 dealId) external view returns (address[3] memory) {
        return arbitrators[dealId];
    }

    function getVotes(uint256 dealId) external view returns (Vote[3] memory) {
        return votes[dealId];
    }

    function totalDeals() external view returns (uint256) {
        return dealCounter;
    }
}
