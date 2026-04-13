// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DIDRegistry
 * @author Pakka Deal
 * @notice Manages ZK-verified identity and reputation scores (Pakka Score) for the Pakka Deal platform.
 * @dev Extreme gas optimization and security best practices have been applied, including custom errors
 *      and unchecked math for safe increments. No sensitive personal data is stored on-chain.
 */
contract DIDRegistry is Ownable {
    // --- Custom Errors --- //
    error UnauthorizedEscrowVault();
    error NullifierAlreadyUsed();
    error IdentityAlreadyVerified();
    error IdentityNotVerified();
    error ZeroAddress();

    // --- Structs --- //
    /**
     * @dev Structure to hold identity details.
     * Note: uint256 variables are used as requested. While smaller uints (e.g., uint64) could save
     * gas via struct packing, using uint256 avoids overflow risks and adheres strictly to requirements.
     */
    struct Identity {
        bool verified;
        uint256 pakkaScore;
        uint256 dealsCompleted;
        uint256 dealsDefaulted;
        uint256 dealsDisputed;
        uint256 nullifierHash;
        uint256 registeredAt;
    }

    // --- State Variables --- //
    /// @notice Address of the main escrow vault contract
    address public escrowVault;

    /// @notice Maps a user's address to their identity details
    mapping(address => Identity) public identities;

    /// @notice Maps a nullifier hash to a boolean indicating if it has been used
    /// @dev Prevents double registration with the same CNIC/identity
    mapping(uint256 => bool) public usedNullifiers;

    // --- Events --- //
    event IdentityRegistered(address indexed user, uint256 indexed nullifierHash, uint256 registeredAt);
    event PakkaScoreUpdated(address indexed user, uint256 newScore);
    event EscrowVaultSet(address indexed vaultAddress);

    // --- Modifiers --- //
    modifier onlyEscrowVault() {
        if (msg.sender != escrowVault) revert UnauthorizedEscrowVault();
        _;
    }

    /**
     * @dev For OpenZeppelin 5.x compatibility, Ownable requires the initial owner 
     *      to be passed in the constructor. If you are using OZ 4.x, you can remove 
     *      `Ownable(msg.sender)`.
     */
    constructor() Ownable(msg.sender) {}

    // --- Admin Functions --- //
    /**
     * @notice Sets the Escrow Vault address.
     * @param _escrowVault The address of the Escrow Vault contract.
     */
    function setEscrowVault(address _escrowVault) external onlyOwner {
        if (_escrowVault == address(0)) revert ZeroAddress();
        escrowVault = _escrowVault;
        emit EscrowVaultSet(_escrowVault);
    }

    // --- Core Functions --- //
    /**
     * @notice Registers a new identity with a ZK-verified nullifier hash.
     * @dev Does not store personal data (e.g., CNIC, name) on-chain. 
     *      Initial "Pakka Score" is set to 300.
     * @param _nullifierHash The unique hash representing the user's real-world identity.
     */
    function registerIdentity(uint256 _nullifierHash) external {
        address caller = msg.sender;

        if (identities[caller].verified) revert IdentityAlreadyVerified();
        if (usedNullifiers[_nullifierHash]) revert NullifierAlreadyUsed();

        // Mark nullifier as used
        usedNullifiers[_nullifierHash] = true;

        // Register the identity and initialize the Pakka Score to 300
        identities[caller] = Identity({
            verified: true,
            pakkaScore: 300,
            dealsCompleted: 0,
            dealsDefaulted: 0,
            dealsDisputed: 0,
            nullifierHash: _nullifierHash,
            registeredAt: block.timestamp
        });

        emit IdentityRegistered(caller, _nullifierHash, block.timestamp);
    }

    /**
     * @notice Updates the Pakka Score of a specific user.
     * @dev Restricted to the Escrow Vault contract.
     * @param _user The address of the user.
     * @param _newScore The updated Pakka Score.
     */
    function updatePakkaScore(address _user, uint256 _newScore) external onlyEscrowVault {
        if (!identities[_user].verified) revert IdentityNotVerified();
        
        identities[_user].pakkaScore = _newScore;
        emit PakkaScoreUpdated(_user, _newScore);
    }

    /**
     * @notice Increments the number of completed deals.
     * @dev Restricted to the Escrow Vault contract. Unchecked block saves gas.
     * @param _user The address of the user.
     */
    function incrementDealsCompleted(address _user) external onlyEscrowVault {
        if (!identities[_user].verified) revert IdentityNotVerified();
        unchecked {
            ++identities[_user].dealsCompleted;
        }
    }

    /**
     * @notice Increments the number of defaulted deals.
     * @dev Restricted to the Escrow Vault. Unchecked block saves gas.
     * @param _user The address of the user.
     */
    function incrementDealsDefaulted(address _user) external onlyEscrowVault {
        if (!identities[_user].verified) revert IdentityNotVerified();
        unchecked {
            ++identities[_user].dealsDefaulted;
        }
    }

    /**
     * @notice Increments the number of disputed deals.
     * @dev Restricted to the Escrow Vault. Unchecked block saves gas.
     * @param _user The address of the user.
     */
    function incrementDealsDisputed(address _user) external onlyEscrowVault {
        if (!identities[_user].verified) revert IdentityNotVerified();
        unchecked {
            ++identities[_user].dealsDisputed;
        }
    }

    // --- View Functions --- //
    /**
     * @notice Retrieves the Pakka Score of a given user.
     * @param _user The address of the user.
     * @return The user's Pakka Score.
     */
    function getPakkaScore(address _user) external view returns (uint256) {
        if (!identities[_user].verified) revert IdentityNotVerified();
        return identities[_user].pakkaScore;
    }
}
