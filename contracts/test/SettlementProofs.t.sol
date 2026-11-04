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
        address payeeAddr,
        uint256 amount,
        uint64 paidAt,
        bytes32 srcTx,
        string memory memo
    ) internal returns (bytes32 refId) {
        refId = proofs.canonicalRefId(srcTx, payeeAddr, amount);
        vm.prank(recorder);
        proofs.recordPayment(refId, payeeAddr, amount, paidAt, srcTx, memo);
    }

    function test_recordPayment_storesImmutableProof() public {
        bytes32 refA = _record(payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        SettlementProofs.Proof memory p = proofs.getProof(refA);
        assertEq(p.refId, refA);
        assertEq(p.payee, payee);
        assertEq(p.amountUSDC, AMOUNT_A);
        assertEq(p.paidAt, PAID_AT_A);
        assertEq(p.srcTxHash, SRC_A);
        assertEq(p.memo, MEMO_A);
        assertEq(p.recordedAt, uint64(block.timestamp));
        assertTrue(proofs.exists(refA));
    }

    function test_recordPayment_emitsPaymentRecorded() public {
        bytes32 refA = proofs.canonicalRefId(SRC_A, payee, AMOUNT_A);
        vm.expectEmit(true, true, false, true, address(proofs));
        emit PaymentRecorded(refA, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        _record(payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);
    }

    function test_recordPayment_revertsOnDuplicateRefId() public {
        bytes32 refA = _record(payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        vm.expectRevert(abi.encodeWithSelector(SettlementProofs.DuplicateRefId.selector, refA));
        vm.prank(recorder);
        proofs.recordPayment(refA, payee, AMOUNT_A, PAID_AT_A, SRC_A, "replay");
        assertEq(proofs.proofCount(), 1);
    }

    function test_recordPayment_revertsWhenRefIdDoesNotMatchPayload() public {
        bytes32 expected = proofs.canonicalRefId(SRC_A, payee, AMOUNT_A);
        bytes32 wrong = keccak256("unbound-ref");
        vm.expectRevert(abi.encodeWithSelector(SettlementProofs.RefIdMismatch.selector, wrong, expected));
        vm.prank(recorder);
        proofs.recordPayment(wrong, payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);
        assertEq(proofs.proofCount(), 0);
    }

    /// A second id for the same payment is not a new settlement. It fails the
    /// binding check, so the original proof is unchanged.
    function test_recordPayment_rejectsReplayUnderAFreshRefId() public {
        bytes32 refA = _record(payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);
        bytes32 fresh = keccak256("replay-new-id");
        vm.expectRevert(abi.encodeWithSelector(SettlementProofs.RefIdMismatch.selector, fresh, refA));
        vm.prank(recorder);
        proofs.recordPayment(fresh, payee, AMOUNT_A, PAID_AT_A, SRC_A, "replay");

        assertEq(proofs.proofCount(), 1);
        assertEq(proofs.getProof(refA).memo, MEMO_A);
        assertFalse(proofs.exists(fresh));
    }

    function test_payloadHash_bindsRefId() public view {
        bytes32 src = 0x592d108234d07171b9dd3e43f0390ebbac989276bf53031522219e1ddfd8eb71;
        address who = 0xfd689a93346AA40D2F38dC2ab6Eb436A57AA45c7;
        uint256 amount = 12_500_000;
        uint64 paidAt = 1_791_223_316;
        bytes32 refId = 0x064a33b196b10c9f249165de66419d9daafb21616633ea15085d53e06d9dc14c;
        bytes32 bound = 0xf98bb56636fb2c50fd25c1aff908af054bf7ddd29232fc4bf70c6de243d34970;

        assertEq(proofs.canonicalRefId(src, who, amount), refId);
        assertEq(proofs.payloadHash(refId, who, amount, paidAt, src), bound);
        assertTrue(proofs.payloadHash(keccak256("other"), who, amount, paidAt, src) != bound);
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

        bytes32 srcB = keccak256("src-b");
        bytes32 refB = proofs.canonicalRefId(srcB, payee, 1);
        vm.prank(extra);
        proofs.recordPayment(refB, payee, 1, PAID_AT_A, srcB, "ok");

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
        bytes32 srcB = keccak256("arc-tx-b");
        uint256 amountB = 4_000_000;
        bytes32 srcC = keccak256("src-c");

        bytes32 refA = _record(payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);
        bytes32 refB = _record(payee, amountB, PAID_AT_A + 1, srcB, "second");
        _record(payee2, 500_000, PAID_AT_A + 2, srcC, "other");

        assertEq(proofs.proofCount(), 3);
        assertEq(proofs.totalSettled(), AMOUNT_A + amountB + 500_000);

        SettlementProofs.Proof[] memory forPayee = proofs.proofsByPayee(payee);
        assertEq(forPayee.length, 2);
        assertEq(forPayee[0].refId, refA);
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
        assertEq(at0.refId, refA);
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
        bytes32 refA = _record(payee, AMOUNT_A, PAID_AT_A, SRC_A, MEMO_A);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, owner, recorderRole
            )
        );
        proofs.recordPayment(refA, payee2, 99, PAID_AT_A, keccak256("hijack"), "override");

        SettlementProofs.Proof memory p = proofs.getProof(refA);
        assertEq(p.payee, payee);
        assertEq(p.amountUSDC, AMOUNT_A);
        assertEq(p.memo, MEMO_A);
    }
}
