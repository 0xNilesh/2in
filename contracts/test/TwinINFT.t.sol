// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TwinINFT} from "../src/TwinINFT.sol";

contract TwinINFTTest is Test {
    TwinINFT internal t;
    address internal alice = address(0xA11CE);
    address internal bob   = address(0xB0B);

    function setUp() public {
        t = new TwinINFT();
    }

    function _hash(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }

    function test_mint_master_sets_state() public {
        vm.prank(alice);
        uint256 id = t.mint(alice, _hash("master-payload"), "0g://master", hex"deadbeef");
        assertEq(id, 1);
        assertEq(t.ownerOf(id), alice);
        (
            address owner,
            bytes32 dh,
            string memory uri,
            bytes memory sk,
            uint256 parent,
            address delegate
        ) = t.getTwin(id);
        assertEq(owner, alice);
        assertEq(dh, _hash("master-payload"));
        assertEq(uri, "0g://master");
        assertEq(keccak256(sk), keccak256(hex"deadbeef"));
        assertEq(parent, 0);
        assertEq(delegate, address(0));
    }

    function test_iCloneFrom_creates_specialist_with_parent_link() public {
        vm.startPrank(alice);
        uint256 master = t.mint(alice, _hash("m"), "0g://m", hex"00");
        uint256 spec = t.iCloneFrom(alice, master, _hash("quill"), "0g://quill", hex"01");
        vm.stopPrank();
        (, , , , uint256 parent, ) = t.getTwin(spec);
        assertEq(parent, master);
    }

    function test_iCloneFrom_blocks_unauthorized() public {
        vm.prank(alice);
        uint256 master = t.mint(alice, _hash("m"), "0g://m", hex"00");
        vm.prank(bob);
        vm.expectRevert(bytes("not_authorized_to_clone"));
        t.iCloneFrom(bob, master, _hash("x"), "0g://x", hex"01");
    }

    function test_updateMetadata_owner_only() public {
        vm.prank(alice);
        uint256 id = t.mint(alice, _hash("v1"), "0g://v1", hex"00");
        vm.prank(bob);
        vm.expectRevert(bytes("not_authorized"));
        t.updateMetadata(id, _hash("v2"), "0g://v2");
        vm.prank(alice);
        t.updateMetadata(id, _hash("v2"), "0g://v2");
        (, bytes32 dh, string memory uri, , , ) = t.getTwin(id);
        assertEq(dh, _hash("v2"));
        assertEq(uri, "0g://v2");
    }

    function test_authorizeUsage_grants_then_revoke() public {
        vm.prank(alice);
        uint256 id = t.mint(alice, _hash("m"), "0g://m", hex"00");
        vm.prank(alice);
        t.authorizeUsage(id, bob, block.timestamp + 30 days);
        assertEq(t.authorizationExpiry(id, bob), block.timestamp + 30 days);
        vm.prank(alice);
        t.revokeAuthorization(id, bob);
        assertEq(t.authorizationExpiry(id, bob), 0);
    }

    function test_delegateAccess_lets_delegate_update() public {
        vm.prank(alice);
        uint256 id = t.mint(alice, _hash("m"), "0g://m", hex"00");
        vm.prank(alice);
        t.delegateAccess(id, bob);
        // delegate may now updateMetadata
        vm.prank(bob);
        t.updateMetadata(id, _hash("v2"), "0g://v2");
        (, bytes32 dh, , , , address delegate) = t.getTwin(id);
        assertEq(dh, _hash("v2"));
        assertEq(delegate, bob);
    }

    function test_transfer_clears_delegate() public {
        vm.prank(alice);
        uint256 id = t.mint(alice, _hash("m"), "0g://m", hex"00");
        vm.prank(alice);
        t.delegateAccess(id, bob);
        vm.prank(alice);
        t.transferFrom(alice, bob, id);
        (, , , , , address delegate) = t.getTwin(id);
        assertEq(delegate, address(0));
    }
}
