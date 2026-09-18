// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {SettlementProofs} from "../src/SettlementProofs.sol";

contract SettlementProofsTest is Test {
    SettlementProofs internal proofs;

    address internal owner = makeAddr("owner");
    address internal recorder = makeAddr("recorder");
    address internal stranger = makeAddr("stranger");
    address internal payee = makeAddr("payee");
    address internal payee2 = makeAddr("payee2");

    bytes32 internal constant REF_A = keccak256("ref-a");
    bytes32 internal constant SRC_A = keccak256("arc-tx-a");
    uint256 internal constant AMOUNT_A = 1_250_000; // 1.25 USDC (6 decimals)
    uint64 internal constant PAID_AT_A = 1_700_000_000;
    string internal constant MEMO_A = "invoice-42";

    bytes32 internal recorderRole;
    bytes32 internal adminRole;

    event PaymentRecorded(
        bytes32 indexed refId,
        address indexed payee,
        uint256 amountUSDC,
        uint64 paidAt,
        bytes32 srcTxHash,
        string memo
    );

    function setUp() public {
        proofs = new SettlementProofs(owner);
        recorderRole = proofs.RECORDER_ROLE();
        adminRole = proofs.DEFAULT_ADMIN_ROLE();
        vm.prank(owner);
        proofs.grantRole(recorderRole, recorder);
    }

    function _record(
        bytes32 refId,
        address payeeAddr,
        uint256 amount,
        uint64 paidAt,
        bytes32 srcTx,
        string memory memo
    ) internal {
        vm.prank(recorder);
        proofs.recordPayment(refId, payeeAddr, amount, paidAt, srcTx, memo);
    }

    function test_recordPayment_storesImmutableProof() public {
        _record(REF_A, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        SettlementProofs.Proof memory p = proofs.getProof(REF_A);
        assertEq(p.refId, REF_A);
        assertEq(p.payee, payee);
        assertEq(p.amountUSDC, AMOUNT_A);
        assertEq(p.paidAt, PAID_AT_A);
        assertEq(p.srcTxHash, SRC_A);
        assertEq(p.memo, MEMO_A);
        assertEq(p.recordedAt, uint64(block.timestamp));
        assertTrue(proofs.exists(REF_A));
    }

    function test_recordPayment_emitsPaymentRecorded() public {
        vm.expectEmit(true, true, false, true, address(proofs));
        emit PaymentRecorded(REF_A, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        _record(REF_A, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);
    }

    function test_recordPayment_revertsOnDuplicateRefId() public {
        _record(REF_A, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        vm.expectRevert(abi.encodeWithSelector(SettlementProofs.DuplicateRefId.selector, REF_A));
        _record(REF_A, payee2, 1, PAID_AT_A, keccak256("other"), "retry");
    }

    function test_recordPayment_revertsZeroInputs() public {
        vm.startPrank(recorder);
        vm.expectRevert(SettlementProofs.ZeroRefId.selector);
        proofs.recordPayment(bytes32(0), payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        vm.expectRevert(SettlementProofs.ZeroPayee.selector);
        proofs.recordPayment(REF_A, address(0), AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        vm.expectRevert(SettlementProofs.ZeroAmount.selector);
        proofs.recordPayment(REF_A, payee, 0, PAID_AT_A, SRC_A, MEMO_A);

        vm.expectRevert(SettlementProofs.ZeroSrcTxHash.selector);
        proofs.recordPayment(REF_A, payee, AMOUNT_A, PAID_AT_A, bytes32(0), MEMO_A);
        vm.stopPrank();
    }

    function test_roleGating_ownerCannotRecord() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, owner, recorderRole
            )
        );
        proofs.recordPayment(REF_A, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);
    }

    function test_roleGating_strangerCannotRecord() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, recorderRole
            )
        );
        proofs.recordPayment(REF_A, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);
    }

    function test_roleGating_strangerCannotGrantRecorder() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole
            )
        );
        proofs.grantRole(recorderRole, stranger);
    }

    function test_roleGating_ownerCanGrantAndRevokeRecorderOnly() public {
        address extra = makeAddr("extra-recorder");
        assertFalse(proofs.hasRole(recorderRole, extra));

        vm.prank(owner);
        proofs.grantRole(recorderRole, extra);
        assertTrue(proofs.hasRole(recorderRole, extra));

        bytes32 refB = keccak256("ref-b");
        vm.prank(extra);
        proofs.recordPayment(refB, payee, 1, PAID_AT_A, keccak256("src-b"), "ok");

        vm.prank(owner);
        proofs.revokeRole(recorderRole, extra);

        vm.prank(extra);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, extra, recorderRole
            )
        );
        proofs.recordPayment(keccak256("ref-c"), payee, 1, PAID_AT_A, keccak256("src-c"), "nope");
    }

    function test_constructor_ownerDoesNotReceiveRecorderRole() public {
        SettlementProofs fresh = new SettlementProofs(owner);
        assertTrue(fresh.hasRole(fresh.DEFAULT_ADMIN_ROLE(), owner));
        assertFalse(fresh.hasRole(fresh.RECORDER_ROLE(), owner));
    }

    function test_constructor_revertsZeroOwner() public {
        vm.expectRevert(SettlementProofs.ZeroOwner.selector);
        new SettlementProofs(address(0));
    }

    function test_views_countTotalAndByPayee() public {
        bytes32 refB = keccak256("ref-b");
        bytes32 srcB = keccak256("arc-tx-b");
        uint256 amountB = 4_000_000;

        _record(REF_A, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);
        _record(refB, payee, amountB, PAID_AT_A + 1, srcB, "second");
        _record(keccak256("ref-c"), payee2, 500_000, PAID_AT_A + 2, keccak256("src-c"), "other");

        assertEq(proofs.proofCount(), 3);
        assertEq(proofs.totalSettled(), AMOUNT_A + amountB + 500_000);

        SettlementProofs.Proof[] memory forPayee = proofs.proofsByPayee(payee);
        assertEq(forPayee.length, 2);
        assertEq(forPayee[0].refId, REF_A);
        assertEq(forPayee[1].refId, refB);
        assertEq(forPayee[0].amountUSDC, AMOUNT_A);
        assertEq(forPayee[1].amountUSDC, amountB);

        SettlementProofs.Proof[] memory forPayee2 = proofs.proofsByPayee(payee2);
        assertEq(forPayee2.length, 1);
        assertEq(forPayee2[0].payee, payee2);

        SettlementProofs.Proof[] memory none = proofs.proofsByPayee(makeAddr("nobody"));
        assertEq(none.length, 0);

        SettlementProofs.Proof memory at0 = proofs.getProofAt(0);
        SettlementProofs.Proof memory at2 = proofs.getProofAt(2);
        assertEq(at0.refId, REF_A);
        assertEq(at2.payee, payee2);
    }

    function test_views_getProofRevertsIfMissing() public {
        vm.expectRevert(abi.encodeWithSelector(SettlementProofs.ProofNotFound.selector, REF_A));
        proofs.getProof(REF_A);
    }

    function test_views_getProofAtRevertsOutOfBounds() public {
        vm.expectRevert(abi.encodeWithSelector(SettlementProofs.IndexOutOfBounds.selector, 0, 0));
        proofs.getProofAt(0);
    }

    function test_appendOnly_noAdminOverrideOfRecordedEntry() public {
        _record(REF_A, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, owner, recorderRole
            )
        );
        proofs.recordPayment(REF_A, payee2, 99, PAID_AT_A, keccak256("hijack"), "override");

        SettlementProofs.Proof memory p = proofs.getProof(REF_A);
        assertEq(p.payee, payee);
        assertEq(p.amountUSDC, AMOUNT_A);
        assertEq(p.memo, MEMO_A);
    }
}
