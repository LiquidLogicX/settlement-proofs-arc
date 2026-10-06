// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SettlementProofs} from "../src/SettlementProofs.sol";

/// @notice Tempo MAINNET (chain 4217) deploy with admin handoff, so Miles's admin key never
///         leaves his wallet. A throwaway deployer key (mainnet-only, never reused) runs:
///           1. deploy SettlementProofs(deployer)
///           2. grantRole(RECORDER_ROLE, RECORDER_ADDRESS)
///           3. grantRole(DEFAULT_ADMIN_ROLE, ADMIN_ADDRESS)
///           4. renounceRole(DEFAULT_ADMIN_ROLE, deployer)
///         and then asserts that the deployer ends with NO role.
///
/// Used for the live Tempo mainnet registry 0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A
/// (2026-10-05 PT). See docs/tempo-mainnet-prep.md.
///
/// Environment (never commit values; PRIVATE_KEY is the throwaway deployer only):
///   PRIVATE_KEY        throwaway deployer key
///   ADMIN_ADDRESS      final DEFAULT_ADMIN_ROLE holder (Miles's own wallet)
///   RECORDER_ADDRESS   RECORDER_ROLE holder (Miles's mainnet recorder hot wallet)
///
/// Dry run (no --broadcast) first, broadcast only after Miles OK:
///   forge script script/DeployTempoMainnetHandoff.s.sol:DeployTempoMainnetHandoff --sig "run()" \
///     --rpc-url https://rpc.tempo.xyz \
///     --private-key "$PRIVATE_KEY" \
///     --tempo.fee-token 0x20C000000000000000000000b9537d11c60E8b50   # USDC.e; add --broadcast --slow after OK
contract DeployTempoMainnetHandoff is Script {
    function run() external {
        address recorder = vm.envAddress("RECORDER_ADDRESS");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        require(block.chainid == 4217, "not Tempo mainnet");
        require(recorder != address(0) && admin != address(0), "zero addr");
        uint256 k = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(k);
        require(deployer != admin && deployer != recorder && admin != recorder, "addr overlap");

        vm.startBroadcast(k);
        SettlementProofs registry = new SettlementProofs(deployer);
        bytes32 rr = registry.RECORDER_ROLE();
        bytes32 ar = registry.DEFAULT_ADMIN_ROLE();
        registry.grantRole(rr, recorder);
        registry.grantRole(ar, admin);
        registry.renounceRole(ar, deployer);
        vm.stopBroadcast();

        require(registry.hasRole(ar, admin), "admin missing");
        require(!registry.hasRole(ar, deployer), "deployer still admin");
        require(!registry.hasRole(rr, deployer), "deployer has recorder");
        require(registry.hasRole(rr, recorder), "recorder missing");
        require(!registry.hasRole(rr, admin), "admin has recorder");
        console.log("SettlementProofs", address(registry));
        console.log("Deployer (no roles after)", deployer);
        console.log("DEFAULT_ADMIN_ROLE", admin);
        console.log("RECORDER_ROLE", recorder);
        console.log("Chain id", block.chainid);
    }
}
