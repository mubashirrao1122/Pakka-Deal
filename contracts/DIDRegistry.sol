// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

// IAnonAadhaar — Interface for the Anon Aadhaar on-chain ZK proof verifier.
// We define it inline so the contract compiles even if the npm package
// is not yet installed. Replace with the package import once available:
//   import "@anon-aadhaar/contracts/interfaces/IAnonAadhaar.sol";
interface IAnonAadhaar {
    function verifyAnonAadhaarProof(
        uint256 nullifierSeed,
        uint256 nullifier,
        uint256 timestamp,
        uint256 signal,
        uint256[4] calldata revealArray,
        uint256[8] calldata groth16Proof
    ) external view returns (bool);
}

contract DIDRegistry is Ownable {

    // ── Identity struct (unchanged) ──────────────────────────
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

    // ── State ────────────────────────────────────────────────
    mapping(address => Identity) public identities;
    mapping(uint256 => bool)     public usedNullifiers;

    address public escrowVault;

    /// @notice Anon Aadhaar ZK verifier contract
    IAnonAadhaar public anonAadhaarVerifier;

    /// @notice Application-specific nullifier seed (unique per dApp)
    uint256 public constant NULLIFIER_SEED = 1234567890;

    /// @notice Maximum proof age: 1 hour (3600 seconds)
    uint256 public constant PROOF_MAX_AGE = 3600;

    // ── Events ───────────────────────────────────────────────
    event DIDRegistered(address indexed wallet, uint256 nullifierHash);
    event ScoreIncremented(address indexed wallet, uint256 newScore, uint256 dealsCompleted);
    event ScoreDecremented(address indexed wallet, uint256 newScore, uint256 dealsDefaulted);
    event EscrowVaultUpdated(address indexed newVault);

    // ── Modifiers ────────────────────────────────────────────
    modifier onlyEscrowVault() {
        require(msg.sender == escrowVault, "Only EscrowVault can call this");
        _;
    }

    // ── Constructor (now accepts verifier address) ───────────
    constructor(address _verifier) Ownable(msg.sender) {
        anonAadhaarVerifier = IAnonAadhaar(_verifier);
    }

    // ══════════════════════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════════════════════

    /// @notice Owner sets EscrowVault address after deployment
    function setEscrowVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault address");
        escrowVault = _vault;
        emit EscrowVaultUpdated(_vault);
    }

    // ══════════════════════════════════════════════════════════
    //  REGISTRATION — ZK Proof via Anon Aadhaar
    // ══════════════════════════════════════════════════════════

    /**
     * @notice Register a DID by providing a valid Anon Aadhaar ZK proof.
     *         Proves the user has a valid government ID and is over 18,
     *         without revealing the actual ID number.
     *
     * @param nullifier      Unique nullifier derived from the user's ID + seed
     * @param timestamp      When the ID document's QR was signed
     * @param signal         Must equal uint256(uint160(msg.sender)) to bind proof to wallet
     * @param revealArray    Selective disclosure: revealArray[0] == 1 ⇒ age > 18
     * @param groth16Proof   The 8-element Groth16 proof array
     */
    function registerDID(
        uint256 nullifier,
        uint256 timestamp,
        uint256 signal,
        uint256[4] calldata revealArray,
        uint256[8] calldata groth16Proof
    ) external {
        require(!identities[msg.sender].verified, "Already registered");
        require(!usedNullifiers[nullifier], "ID already registered to another wallet");
        require(nullifier != 0, "Invalid nullifier");

        // ── Signal must match the caller's wallet address ──
        require(
            signal == uint256(uint160(msg.sender)),
            "Signal must match msg.sender"
        );

        // ── Age > 18 check: revealArray[0] must be 1 ──
        require(
            revealArray[0] == 1,
            "Must be over 18 to register"
        );

        // ── Proof freshness: timestamp within PROOF_MAX_AGE ──
        require(
            block.timestamp - timestamp <= PROOF_MAX_AGE,
            "Proof expired: generate a fresh QR scan"
        );

        // ── Verify the Groth16 ZK proof on-chain ──
        require(
            anonAadhaarVerifier.verifyAnonAadhaarProof(
                NULLIFIER_SEED,
                nullifier,
                timestamp,
                signal,
                revealArray,
                groth16Proof
            ),
            "Invalid Anon Aadhaar proof"
        );

        // ── Initialize identity ──
        identities[msg.sender] = Identity({
            verified:       true,
            pakkaScore:     100,
            dealsCompleted: 0,
            dealsDefaulted: 0,
            dealsDisputed:  0,
            nullifierHash:  nullifier,
            totalVolumeWei: 0,
            registeredAt:   block.timestamp
        });

        usedNullifiers[nullifier] = true;

        emit DIDRegistered(msg.sender, nullifier);
    }

    // ══════════════════════════════════════════════════════════
    //  SCORING — called by EscrowVault
    // ══════════════════════════════════════════════════════════

    /// @notice Called by EscrowVault on deal completion
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

    /// @notice Called by EscrowVault on default or dispute loss
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

    // ══════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════

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
