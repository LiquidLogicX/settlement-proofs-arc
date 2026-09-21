// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SettlementProofs
/// @notice Append-only notarization registry for an AI treasurer (Decision 1A+2B).
/// @dev Payment stays on Base; this contract records an immutable proof on Arc.
///      `srcTxHash` is the **Base** USDC payment transaction hash (public).
///      `amountUSDC` is 6-decimal ERC-20 units (same as Base USDC / Arc ERC-20 USDC) —
///      never Arc native gas wei (18 decimals). Payee is cleartext (Decision 2B).
///      Owner (DEFAULT_ADMIN_ROLE) may grant/revoke RECORDER_ROLE only and cannot
///      write proofs. Recorded entries cannot be edited, deleted, or overridden.
///      No Circle x402 / Arc settlement rail in this registry path (1B is out of scope).
contract SettlementProofs is AccessControl {
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

    struct Proof {
        bytes32 refId;
        address payee;
        uint256 amountUSDC;
        uint64 paidAt;
        bytes32 srcTxHash;
        string memo;
        uint64 recordedAt;
    }

    error ZeroOwner();
    error ZeroRefId();
    error ZeroPayee();
    error ZeroAmount();
    error ZeroSrcTxHash();
    error DuplicateRefId(bytes32 refId);
    error ProofNotFound(bytes32 refId);
    error IndexOutOfBounds(uint256 index, uint256 length);

    event PaymentRecorded(
        bytes32 indexed refId,
        address indexed payee,
        uint256 amountUSDC,
        uint64 paidAt,
        bytes32 srcTxHash,
        string memo
    );

    mapping(bytes32 refId => Proof proof) private _proofs;
    mapping(bytes32 refId => bool recorded) private _recorded;
    mapping(address payee => bytes32[] refIds) private _refIdsByPayee;
    bytes32[] private _refIds;
    uint256 private _totalSettled;

    /// @param owner Account granted DEFAULT_ADMIN_ROLE. Does not receive RECORDER_ROLE.
    constructor(address owner) {
        if (owner == address(0)) revert ZeroOwner();
        _grantRole(DEFAULT_ADMIN_ROLE, owner);
    }

    /// @notice Record one immutable settlement proof. Only RECORDER_ROLE.
    /// @param payee Cleartext recipient of the Base USDC transfer (public).
    /// @param amountUSDC Amount in 6-decimal ERC-20 USDC units (not native 18-dec wei).
    /// @param srcTxHash Base payment transaction hash (public).
    function recordPayment(
        bytes32 refId,
        address payee,
        uint256 amountUSDC,
        uint64 paidAt,
        bytes32 srcTxHash,
        string calldata memo
    ) external onlyRole(RECORDER_ROLE) {
        if (refId == bytes32(0)) revert ZeroRefId();
        if (payee == address(0)) revert ZeroPayee();
        if (amountUSDC == 0) revert ZeroAmount();
        if (srcTxHash == bytes32(0)) revert ZeroSrcTxHash();
        if (_recorded[refId]) revert DuplicateRefId(refId);

        Proof memory proof = Proof({
            refId: refId,
            payee: payee,
            amountUSDC: amountUSDC,
            paidAt: paidAt,
            srcTxHash: srcTxHash,
            memo: memo,
            // timestamps fit uint64 for any realistic settlement date
            // forge-lint: disable-next-line(unsafe-typecast)
            recordedAt: uint64(block.timestamp)
        });

        _proofs[refId] = proof;
        _recorded[refId] = true;
        _refIdsByPayee[payee].push(refId);
        _refIds.push(refId);
        _totalSettled += amountUSDC;

        emit PaymentRecorded(refId, payee, amountUSDC, paidAt, srcTxHash, memo);
    }

    function getProof(bytes32 refId) external view returns (Proof memory) {
        if (!_recorded[refId]) revert ProofNotFound(refId);
        return _proofs[refId];
    }

    function proofCount() external view returns (uint256) {
        return _refIds.length;
    }

    /// @notice Proofs indexed by cleartext payee address.
    function proofsByPayee(address payee) external view returns (Proof[] memory proofs) {
        bytes32[] storage ids = _refIdsByPayee[payee];
        proofs = new Proof[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            proofs[i] = _proofs[ids[i]];
        }
    }

    function totalSettled() external view returns (uint256) {
        return _totalSettled;
    }

    /// @notice Enumeration helper for public ledgers. Index is insertion order (0..proofCount-1).
    function getProofAt(uint256 index) external view returns (Proof memory) {
        if (index >= _refIds.length) revert IndexOutOfBounds(index, _refIds.length);
        return _proofs[_refIds[index]];
    }

    function exists(bytes32 refId) external view returns (bool) {
        return _recorded[refId];
    }
}
