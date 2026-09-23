// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SettlementProofs} from "../src/SettlementProofs.sol";

/// @notice Deploy SettlementProofs and grant RECORDER_ROLE to the recorder address.
///
/// DEPLOY NOTES (Part 4 / Decisions 1A+2B):
///   Storage layout and ABI changed — cleartext `payee` replaced `payeeCommit`;
///   `viewSaltKeyId` and `VerificationStatus` were removed. Any previously
///   deployed mainnet address is OBSOLETE. Do NOT point the recorder/web at an
///   old address. Redeploy only when Miles has funded an Arc gas wallet and
///   provided PRIVATE_KEY / RECORDER_ADDRESS. Leave SETTLEMENT_PROOFS_ADDRESS
///   as TBD until then.
///
/// Environment:
///   PRIVATE_KEY         Deployer key. Becomes DEFAULT_ADMIN_ROLE (owner).
///   RECORDER_ADDRESS    Address of the recorder service wallet (no treasury funds).
///
/// Mainnet (Arc chainId 5042):
///   forge script script/Deploy.s.sol:DeploySettlementProofs \
///     --rpc-url https://rpc.mainnet.arc.io \
///     --broadcast --slow \
///     --private-key $PRIVATE_KEY
///
/// Testnet (Arc chainId 5042002):
///   forge script script/Deploy.s.sol:DeploySettlementProofs \
///     --rpc-url $ARC_TESTNET_RPC_URL \
///     --broadcast --slow \
///     --private-key $PRIVATE_KEY
///
/// Tempo Moderato testnet (chainId 42431) — NO Tempo mainnet:
///   forge script script/Deploy.s.sol:DeploySettlementProofs --sig "run()" \
///     --rpc-url https://rpc.moderato.tempo.xyz \
///     --broadcast --slow \
///     --private-key $PRIVATE_KEY \
///     --tempo.fee-token pathUSD
///
/// RECORDER_ADDRESS may also be passed as the first argument:
///   forge script script/Deploy.s.sol:DeploySettlementProofs --sig "run(address)" $RECORDER_ADDRESS ...
contract DeploySettlementProofs is Script {
    function run() external {
        address recorder = vm.envAddress("RECORDER_ADDRESS");
        _deploy(recorder);
    }

    function run(address recorder) external {
        _deploy(recorder);
    }

    function _deploy(address recorder) internal {
        require(recorder != address(0), "RECORDER_ADDRESS is zero");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        SettlementProofs registry = new SettlementProofs(deployer);
        bytes32 recorderRole = registry.RECORDER_ROLE();
        registry.grantRole(recorderRole, recorder);
        vm.stopBroadcast();

        console.log("SettlementProofs", address(registry));
        console.log("Owner (DEFAULT_ADMIN_ROLE)", deployer);
        console.log("Recorder (RECORDER_ROLE)", recorder);
        console.log("Chain id", block.chainid);
        require(
            !registry.hasRole(registry.RECORDER_ROLE(), deployer),
            "owner must not hold RECORDER_ROLE"
        );
        require(registry.hasRole(registry.RECORDER_ROLE(), recorder), "recorder grant failed");
    }
}
