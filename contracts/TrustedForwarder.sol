// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

// OpenZeppelin v5 replaced MinimalForwarder with ERC2771Forwarder (EIP-2771).
// No modifications needed.
// EscrowVault accepts this as the trusted forwarder (EIP-2771).
contract PakkaDealForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("PakkaDealForwarder") {}
}
