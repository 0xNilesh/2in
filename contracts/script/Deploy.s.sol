// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {TwinINFT} from "../src/TwinINFT.sol";

/// Deploys TwinINFT to whatever network the foundry --rpc-url points at.
///   forge script script/Deploy.s.sol:Deploy --rpc-url galileo --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    function run() external returns (TwinINFT t) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        t = new TwinINFT();
        vm.stopBroadcast();
    }
}
