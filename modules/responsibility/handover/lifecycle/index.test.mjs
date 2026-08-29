import assert from "node:assert/strict";
import test from "node:test";
import { HandoverCode, expireHandover, declineHandover, reviseHandover, submitHandover } from "./index.mjs";

const domain = Object.freeze({ id: "domain-1", familyId: "family-1", accountableOwnerId: "mother", version: 7, untouched: { marker: true } });
const base = Object.freeze({
  id: "handover-1", familyId: "family-1", domainId: "domain-1", fromOwnerId: "mother", proposedOwnerId: "father",
  status: "draft", missingFields: [], confirmationRequiredFromId: null, acknowledgements: [{ memberId: "father", handoverVersion: 1, acknowledgedAt: "2026-08-01T00:00:00.000Z" }],
  expectedDomainVersion: 7, expiresAt: "2026-09-01T00:00:00.000Z", version: 1, untouched: { marker: true },
});

function clone(value) { return structuredClone(value); }
function assertOwnerUnchanged(result) { assert.equal(result.domain.accountableOwnerId, "mother"); assert.equal(result.domain.version, 7); assert.deepEqual(result.domain.untouched, { marker: true }); }

test("submit advances a complete draft to pending_ack without mutating inputs", () => {
  const beforeDomain = clone(domain); const beforeHandover = clone(base);
  const result = submitHandover({ domain, handover: base, actorId: "mother", expectedVersion: 1 });
  assert.equal(result.code, HandoverCode.OK); assert.equal(result.handover.status, "pending_ack"); assert.deepEqual(result.handover.missingFields, []);
  assert.equal(result.handover.confirmationRequiredFromId, "father"); assert.equal(result.handover.version, 2); assertOwnerUnchanged(result);
  assert.deepEqual(domain, beforeDomain); assert.deepEqual(base, beforeHandover); assert.notEqual(result.domain, domain); assert.notEqual(result.handover, base);
});

test("submit exposes deterministic missing fields and retains owner", () => {
  const handover = { ...base, proposedOwnerId: "", expiresAt: null };
  const result = submitHandover({ domain, handover, actorId: "mother" });
  assert.equal(result.code, HandoverCode.INCOMPLETE); assert.equal(result.handover.status, "pending_info");
  assert.deepEqual(result.handover.missingFields, ["proposedOwnerId", "expiresAt"]); assert.equal(result.handover.confirmationRequiredFromId, null); assertOwnerUnchanged(result);
});

test("submit preserves upstream missing information alongside structural gaps without mutating inputs", () => {
  const handover = { ...base, proposedOwnerId: "", expiresAt: null, missingFields: ["scopeIncluded", "scopeIncluded"] };
  const before = clone(handover);
  const result = submitHandover({ domain, handover, actorId: "mother" });
  assert.equal(result.code, HandoverCode.INCOMPLETE); assert.equal(result.handover.status, "pending_info");
  assert.deepEqual(result.handover.missingFields, ["scopeIncluded", "proposedOwnerId", "expiresAt"]); assertOwnerUnchanged(result);
  assert.deepEqual(handover, before);
});

test("submit retains complete proposal policy missing information", () => {
  const result = submitHandover({ domain, handover: { ...base, missingFields: ["scopeIncluded", "nextActionId"] }, actorId: "mother" });
  assert.equal(result.code, HandoverCode.INCOMPLETE); assert.equal(result.handover.status, "pending_info");
  assert.deepEqual(result.handover.missingFields, ["scopeIncluded", "nextActionId"]); assert.equal(result.handover.confirmationRequiredFromId, null);
  assertOwnerUnchanged(result);
});

test("submit rejects wrong transition, actor, and stale version", () => {
  assert.equal(submitHandover({ domain, handover: { ...base, status: "pending_ack" }, actorId: "mother" }).code, HandoverCode.INVALID_TRANSITION);
  assert.equal(submitHandover({ domain, handover: base, actorId: "father" }).code, HandoverCode.PERMISSION);
  assert.equal(submitHandover({ domain, handover: base, actorId: "mother", expectedVersion: 0 }).code, HandoverCode.CONFLICT);
});

test("revise accepts only allowlisted patch fields, clears acknowledgements, and can return pending_info", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 3 };
  const result = reviseHandover({ domain, handover: pending, actorId: "father", expectedVersion: 3, patch: { proposedOwnerId: "", expiresAt: null } });
  assert.equal(result.code, HandoverCode.INCOMPLETE); assert.equal(result.handover.status, "pending_info"); assert.deepEqual(result.handover.acknowledgements, []);
  assert.deepEqual(result.handover.missingFields, ["proposedOwnerId", "expiresAt"]); assert.equal(result.handover.version, 4); assertOwnerUnchanged(result);
  assert.equal(reviseHandover({ domain, handover: pending, actorId: "mother", patch: { status: "accepted" } }).code, HandoverCode.INVALID_TRANSITION);
  assert.equal(reviseHandover({ domain, handover: pending, actorId: "grandmother", patch: {} }).code, HandoverCode.PERMISSION);
  assert.equal(reviseHandover({ domain, handover: pending, actorId: "father", expectedVersion: 2, patch: {} }).code, HandoverCode.CONFLICT);
});

test("revise can clear explicit missing information only after structural fields are complete", () => {
  const pending = { ...base, status: "pending_info", missingFields: ["scopeIncluded"], acknowledgements: [{ memberId: "father", handoverVersion: 3, acknowledgedAt: "2026-08-01T00:00:00.000Z" }], version: 3 };
  const before = clone(pending);
  const patch = { missingFields: [] };
  const beforePatch = clone(patch);
  const result = reviseHandover({ domain, handover: pending, actorId: "mother", expectedVersion: 3, patch });
  assert.equal(result.code, HandoverCode.OK); assert.equal(result.handover.status, "pending_ack"); assert.deepEqual(result.handover.missingFields, []);
  assert.deepEqual(result.handover.acknowledgements, []); assert.equal(result.handover.version, 4); assertOwnerUnchanged(result);
  assert.deepEqual(pending, before); assert.deepEqual(patch, beforePatch);
});

test("revise rejects malformed missingFields patches without mutating inputs", () => {
  const pending = { ...base, status: "pending_info", missingFields: ["scopeIncluded"], version: 3 };
  const before = clone(pending);
  for (const missingFields of ["scopeIncluded", [""], ["private proposal"], ["scopeIncluded", 1], ["scopeIncluded", "scopeIncluded"]]) {
    const result = reviseHandover({ domain, handover: pending, actorId: "mother", expectedVersion: 3, patch: { missingFields } });
    assert.equal(result.code, HandoverCode.INVALID_TRANSITION); assertOwnerUnchanged(result);
  }
  assert.deepEqual(pending, before);
});

test("decline requires pending acknowledgement and the current confirmer", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 5 };
  const result = declineHandover({ domain, handover: pending, actorId: "father", expectedVersion: 5 });
  assert.equal(result.code, HandoverCode.OK); assert.equal(result.handover.status, "declined"); assert.equal(result.handover.confirmationRequiredFromId, null); assert.equal(result.handover.version, 6); assertOwnerUnchanged(result);
  assert.equal(declineHandover({ domain, handover: pending, actorId: "mother" }).code, HandoverCode.PERMISSION);
  assert.equal(declineHandover({ domain, handover: { ...pending, status: "pending_info" }, actorId: "father" }).code, HandoverCode.INVALID_TRANSITION);
  assert.equal(declineHandover({ domain, handover: pending, actorId: "father", expectedVersion: 4 }).code, HandoverCode.CONFLICT);
});

test("expiry applies only after the deadline and never changes owner", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 9 };
  const notExpired = expireHandover({ domain, handover: pending, now: "2026-09-01T00:00:00.000Z" });
  assert.equal(notExpired.code, HandoverCode.NOT_EXPIRED); assertOwnerUnchanged(notExpired);
  const expired = expireHandover({ domain, handover: pending, now: "2026-09-01T00:00:00.001Z", expectedVersion: 9 });
  assert.equal(expired.code, HandoverCode.OK); assert.equal(expired.handover.status, "expired"); assert.equal(expired.handover.confirmationRequiredFromId, null); assertOwnerUnchanged(expired);
  assert.equal(expireHandover({ domain, handover: { ...pending, status: "declined" }, now: "2026-10-01T00:00:00.000Z" }).code, HandoverCode.INVALID_TRANSITION);
  assert.equal(expireHandover({ domain, handover: pending, now: "invalid" }).code, HandoverCode.NOT_EXPIRED);
  assert.equal(expireHandover({ domain, handover: pending, now: "2026-10-01T00:00:00.000Z", expectedVersion: 8 }).code, HandoverCode.CONFLICT);
});

test("domain mismatch does not leak proposal data through errors", () => {
  const result = submitHandover({ domain, handover: { ...base, domainId: "other", privateProposal: "secret" }, actorId: "mother" });
  assert.deepEqual(Object.keys(result).sort(), ["code", "domain", "handover", "ok"]); assert.equal(result.code, HandoverCode.INVALID_TRANSITION);
  assert.equal("privateProposal" in result.handover, false);
});

test("all commands reject a handover bound to a stale domain version", () => {
  const stale = { ...base, expectedDomainVersion: 6 };
  assert.equal(submitHandover({ domain, handover: stale, actorId: "mother" }).code, HandoverCode.CONFLICT);
  const pending = { ...stale, status: "pending_ack", confirmationRequiredFromId: "father" };
  assert.equal(reviseHandover({ domain, handover: pending, actorId: "father", patch: {} }).code, HandoverCode.CONFLICT);
  assert.equal(declineHandover({ domain, handover: pending, actorId: "father" }).code, HandoverCode.CONFLICT);
  assert.equal(expireHandover({ domain, handover: pending, now: "2026-10-01T00:00:00.000Z" }).code, HandoverCode.CONFLICT);
});
