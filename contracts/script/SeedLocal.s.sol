// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SettlementProofs} from "../src/SettlementProofs.sol";

/// @notice Local-only seed: deploy + record sample proofs (Anvil).
contract SeedLocal is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address recorder = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        SettlementProofs registry = new SettlementProofs(recorder);
        bytes32 recorderRole = registry.RECORDER_ROLE();
        registry.grantRole(recorderRole, recorder);

        address payeeAlice = 0x1111111111111111111111111111111111111111;
        address payeeVendor = 0x2222222222222222222222222222222222222222;

        _record(
            registry,
            keccak256("seed-ref-1"),
            payeeAlice,
            12_500_000,
            uint64(block.timestamp - 3 days),
            keccak256("arc-tx-payroll-alice"),
            "Monthly payroll"
        );
        _record(
            registry,
            keccak256("seed-ref-2"),
            payeeVendor,
            3_000_000,
            uint64(block.timestamp - 2 days),
            keccak256("arc-tx-vendor-rpc"),
            "Arc RPC invoice - Q3"
        );
        _record(
            registry,
            keccak256("seed-ref-3"),
            payeeAlice,
            750_000,
            uint64(block.timestamp - 6 hours),
            keccak256("arc-tx-bonus"),
            "Discretionary bonus"
        );
        vm.stopBroadcast();

        console.log("SETTLEMENT_PROOFS_ADDRESS", address(registry));
        console.log("RECORDER", recorder);
        console.log("proofCount", registry.proofCount());
        console.log("totalSettled", registry.totalSettled());
    }

    function _record(
        SettlementProofs registry,
        bytes32 refId,
        address payee,
        uint256 amount,
        uint64 paidAt,
        bytes32 srcTx,
        string memory memo
    ) internal {
        registry.recordPayment(refId, payee, amount, paidAt, srcTx, memo);
    }
}
