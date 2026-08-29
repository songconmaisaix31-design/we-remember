import assert from "node:assert/strict";
import test from "node:test";

import {
  HANDOVER_STATUSES,
  HANDOVER_TRANSITION_MATRIX,
  OWNERSHIP_ERROR_CODES,
  OWNERSHIP_RESULT_CODES,
  assertHandoverTransition,
  assertHumanAccountableOwner,
  compareOptimisticVersion,
  isAllowedHandoverTransition,
  resolveMemberInFamily,
} from "./index.mjs";

const familyId = "family-1";
const members = Object.freeze([
  Object.freeze({ id: "mother", familyId, kind: "human" }),
  Object.freeze({ id: "helper", familyId, kind: "agent" }),
  Object.freeze({ id: "outside", familyId: "family-2", kind: "human" }),
]);

const domain = Object.freeze({ familyId, accountableOwnerId: "mother" });

test("resolves a member only within the requested family", () => {
  const result = resolveMemberInFamily(members, familyId, "mother");
  assert.equal(result.ok, true);
  assert.equal(result.code, OWNERSHIP_RESULT_CODES.MEMBER_RESOLVED);
  assert.equal(result.member, members[0]);
});

test("rejects cross-family and missing members with safe codes", () => {
  assert.deepEqual(resolveMemberInFamily(members, familyId, "outside"), {
    ok: false,
    code: OWNERSHIP_ERROR_CODES.MEMBER_OUTSIDE_FAMILY,
  });
  assert.deepEqual(resolveMemberInFamily(members, familyId, "unknown"), {
    ok: false,
    code: OWNERSHIP_ERROR_CODES.MEMBER_MISSING,
  });
});

test("accepts a human accountable owner without mutating frozen inputs", () => {
  const result = assertHumanAccountableOwner(domain, members);
  assert.equal(result.ok, true);
  assert.equal(result.code, OWNERSHIP_RESULT_CODES.HUMAN_OWNER_CONFIRMED);
  assert.equal(result.owner, members[0]);
  assert.deepEqual(domain, { familyId, accountableOwnerId: "mother" });
});

test("rejects agent, cross-family, and missing accountable owners", () => {
  assert.equal(
    assertHumanAccountableOwner({ familyId, accountableOwnerId: "helper" }, members).code,
    OWNERSHIP_ERROR_CODES.OWNER_NOT_HUMAN,
  );
  assert.equal(
    assertHumanAccountableOwner({ familyId, accountableOwnerId: "outside" }, members).code,
    OWNERSHIP_ERROR_CODES.OWNER_OUTSIDE_FAMILY,
  );
  assert.equal(
    assertHumanAccountableOwner({ familyId, accountableOwnerId: "unknown" }, members).code,
    OWNERSHIP_ERROR_CODES.OWNER_MISSING,
  );
});

test("compares current positive versions and rejects stale versions", () => {
  assert.deepEqual(compareOptimisticVersion(3, 3), {
    ok: true,
    code: OWNERSHIP_RESULT_CODES.VERSION_CURRENT,
  });
  assert.equal(compareOptimisticVersion(3, 2).code, OWNERSHIP_ERROR_CODES.VERSION_CONFLICT);
  assert.equal(compareOptimisticVersion(0, 1).code, OWNERSHIP_ERROR_CODES.INVALID_VERSION);
  assert.equal(compareOptimisticVersion(1, 0).code, OWNERSHIP_ERROR_CODES.INVALID_VERSION);
});

test("allows every transition in the exact frozen handover matrix", () => {
  for (const [fromStatus, allowedTargets] of Object.entries(HANDOVER_TRANSITION_MATRIX)) {
    for (const toStatus of allowedTargets) {
      assert.equal(isAllowedHandoverTransition(fromStatus, toStatus), true);
      assert.deepEqual(assertHandoverTransition(fromStatus, toStatus), {
        ok: true,
        code: OWNERSHIP_RESULT_CODES.TRANSITION_ALLOWED,
      });
    }
  }
});

test("rejects every transition outside the frozen handover matrix", () => {
  for (const fromStatus of HANDOVER_STATUSES) {
    for (const toStatus of HANDOVER_STATUSES) {
      if (!HANDOVER_TRANSITION_MATRIX[fromStatus].includes(toStatus)) {
        assert.equal(
          assertHandoverTransition(fromStatus, toStatus).code,
          OWNERSHIP_ERROR_CODES.TRANSITION_FORBIDDEN,
        );
      }
    }
  }
});

test("keeps terminal handover states closed", () => {
  for (const terminalStatus of ["accepted", "declined", "expired"]) {
    assert.deepEqual(HANDOVER_TRANSITION_MATRIX[terminalStatus], []);
    for (const targetStatus of HANDOVER_STATUSES) {
      assert.equal(isAllowedHandoverTransition(terminalStatus, targetStatus), false);
    }
  }
});
