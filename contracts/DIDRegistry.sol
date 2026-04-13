// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DIDRegistry is Ownable {

    struct Identity {
        bool    verified;
        uint256 pakkaScore;
        uint256 dealsCompleted;
        uint256 dealsDefaulted;
        uint256 dealsDisputed;
        uint256 nullifierHash;
        uint256 totalVolumeWei;
        uint256 registeredAt;
    }

    mapping(address => Identity) public identities;
    mapping(uint256 => bool)     public usedNullifiers;

    address public escrowVault;

    event DIDRegistered(address indexed wallet, uint256 nullifierHash);
    event ScoreIncremented(address indexed wallet, uint256 newScore, uint256 dealsCompleted);
    event ScoreDecremented(address indexed wallet, uint256 newScore, uint256 dealsDefaulted);
    event EscrowVaultUpdated(address indexed newVault);

    modifier onlyEscrowVault() {
        require(msg.sender == escrowVault, "Only EscrowVault can call this");
        _;
    }

    constructor() Ownable(msg.sender) {}

    // ── Owner sets EscrowVault address after deployment ──
    function setEscrowVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault address");
        escrowVault = _vault;
        emit EscrowVaultUpdated(_vault);
    }

    // ── Register identity (user calls this once) ──
    // nullifierHash = keccak256 of CNIC — prevents duplicate registration
    // In production this would be a ZK proof verification
    // For hackathon: simplified to hash check
    function registerDID(uint256 nullifierHash) external {
        require(!identities[msg.sender].verified, "Already registered");
        require(!usedNullifiers[nullifierHash], "CNIC already registered to another wallet");
        require(nullifierHash != 0, "Invalid nullifier");

        identities[msg.sender] = Identity({
            verified:       true,
            pakkaScore:     100,
            dealsCompleted: 0,
            dealsDefaulted: 0,
            dealsDisputed:  0,
            nullifierHash:  nullifierHash,
            totalVolumeWei: 0,
            registeredAt:   block.timestamp
        });

        usedNullifiers[nullifierHash] = true;

        emit DIDRegistered(msg.sender, nullifierHash);
    }

    // ── Called by EscrowVault on deal completion ──
    function incrementScore(address user) external onlyEscrowVault {
        if (!identities[user].verified) return;
        Identity storage id = identities[user];

        id.dealsCompleted++;

        uint256 increase = 50;

        // Bonus: milestone streak bonus (every 5 deals)
        if (id.dealsCompleted % 5 == 0) {
            increase += 25;
        }

        id.pakkaScore = id.pakkaScore + increase > 1000
            ? 1000
            : id.pakkaScore + increase;

        emit ScoreIncremented(user, id.pakkaScore, id.dealsCompleted);
    }

    // ── Called by EscrowVault on default or dispute loss ──
    function decrementScore(address user) external onlyEscrowVault {
        if (!identities[user].verified) return;
        Identity storage id = identities[user];

        id.dealsDefaulted++;

        uint256 decrease = 100;

        id.pakkaScore = id.pakkaScore > decrease
            ? id.pakkaScore - decrease
            : 0;

        emit ScoreDecremented(user, id.pakkaScore, id.dealsDefaulted);
    }

    // ── View functions ──
    function getIdentity(address user) external view returns (Identity memory) {
        return identities[user];
    }

    function getScore(address user) external view returns (uint256) {
        return identities[user].pakkaScore;
    }

    function isVerified(address user) external view returns (bool) {
        return identities[user].verified;
    }

    function getTier(address user) external view returns (string memory) {
        uint256 score = identities[user].pakkaScore;
        if (score >= 851) return "PAKKA_VERIFIED";
        if (score >= 601) return "TRUSTED";
        if (score >= 301) return "VERIFIED";
        return "NEW_USER";
    }

    function getCollateralDiscount(address user) external view returns (uint256) {
        uint256 score = identities[user].pakkaScore;
        if (score >= 851) return 30; // 30% discount on collateral
        if (score >= 601) return 20; // 20% discount
        if (score >= 301) return 10; // 10% discount
        return 0;
    }
}
