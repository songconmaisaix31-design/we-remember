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
  assert.equal(result.ok, true); assert.equal(result.code, HandoverCode.OK); assert.equal(result.handover.status, "pending_ack"); assert.deepEqual(result.handover.missingFields, []);
  assert.equal(result.handover.confirmationRequiredFromId, "father"); assert.equal(result.handover.version, 2); assertOwnerUnchanged(result);
  assert.deepEqual(domain, beforeDomain); assert.deepEqual(base, beforeHandover); assert.notEqual(result.domain, domain); assert.notEqual(result.handover, base);
});

test("submit accepts null expiresAt as no automatic expiry", () => {
  const result = submitHandover({ domain, handover: { ...base, expiresAt: null }, actorId: "mother", expectedVersion: 1 });
  assert.equal(result.ok, true); assert.equal(result.code, HandoverCode.OK); assert.equal(result.handover.status, "pending_ack");
  assert.deepEqual(result.handover.missingFields, []); assert.equal(result.handover.expiresAt, null); assert.equal(result.handover.version, 2); assertOwnerUnchanged(result);
});

test("submit and revise never persist an invalid expiresAt", () => {
  for (const expiresAt of ["2030-02-30T00:00:00Z", "2026-09-01T24:00:00Z", new Date("2026-09-01T00:00:00Z")]) {
    const draft = { ...base, expiresAt };
    const beforeDraft = clone(draft);
    const submitted = submitHandover({ domain, handover: draft, actorId: "mother", expectedVersion: 1 });
    assert.equal(submitted.ok, false); assert.equal(submitted.code, HandoverCode.INVALID_INPUT);
    assert.equal(submitted.handover.version, 1); assert.deepEqual(draft, beforeDraft); assertOwnerUnchanged(submitted);

    const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 3 };
    const patch = { expiresAt };
    const beforePending = clone(pending); const beforePatch = clone(patch);
    const revised = reviseHandover({ domain, handover: pending, actorId: "father", expectedVersion: 3, patch });
    assert.equal(revised.ok, false); assert.equal(revised.code, HandoverCode.INVALID_INPUT);
    assert.equal(revised.handover.version, 3); assert.equal(revised.handover.expiresAt, base.expiresAt);
    assert.deepEqual(pending, beforePending); assert.deepEqual(patch, beforePatch); assertOwnerUnchanged(revised);
  }
});

test("submit persists pending_info with deterministic missing fields and retains owner", () => {
  const handover = { ...base, proposedOwnerId: "", expiresAt: null };
  const result = submitHandover({ domain, handover, actorId: "mother", expectedVersion: 1 });
  assert.equal(result.ok, true); assert.equal(result.code, HandoverCode.INCOMPLETE); assert.equal(result.handover.status, "pending_info");
  assert.deepEqual(result.handover.missingFields, ["proposedOwnerId"]); assert.equal(result.handover.confirmationRequiredFromId, null);
  assert.equal(result.handover.version, 2); assertOwnerUnchanged(result);
});

test("submit preserves upstream missing information alongside structural gaps without mutating inputs", () => {
  const handover = { ...base, proposedOwnerId: "", expiresAt: null, missingFields: ["scopeIncluded", "scopeIncluded"] };
  const before = clone(handover);
  const result = submitHandover({ domain, handover, actorId: "mother", expectedVersion: 1 });
  assert.equal(result.ok, true); assert.equal(result.code, HandoverCode.INCOMPLETE); assert.equal(result.handover.status, "pending_info");
  assert.deepEqual(result.handover.missingFields, ["scopeIncluded", "proposedOwnerId"]); assertOwnerUnchanged(result);
  assert.deepEqual(handover, before);
});

test("submit retains complete proposal policy missing information", () => {
  const result = submitHandover({ domain, handover: { ...base, missingFields: ["scopeIncluded", "nextActionId"] }, actorId: "mother", expectedVersion: 1 });
  assert.equal(result.ok, true); assert.equal(result.code, HandoverCode.INCOMPLETE); assert.equal(result.handover.status, "pending_info");
  assert.deepEqual(result.handover.missingFields, ["scopeIncluded", "nextActionId"]); assert.equal(result.handover.confirmationRequiredFromId, null);
  assert.equal(result.handover.version, 2); assertOwnerUnchanged(result);
});

test("submit rejects wrong transition, actor, and stale version", () => {
  assert.equal(submitHandover({ domain, handover: { ...base, status: "pending_ack" }, actorId: "mother" }).code, HandoverCode.INVALID_TRANSITION);
  assert.equal(submitHandover({ domain, handover: base, actorId: "father", expectedVersion: 1 }).code, HandoverCode.PERMISSION);
  assert.equal(submitHandover({ domain, handover: base, actorId: "mother", expectedVersion: 0 }).code, HandoverCode.CONFLICT);
});

test("revise accepts only allowlisted patch fields, clears acknowledgements, and can return pending_info", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 3 };
  const result = reviseHandover({ domain, handover: pending, actorId: "father", expectedVersion: 3, patch: { expiresAt: null, missingFields: ["scopeIncluded"] } });
  assert.equal(result.ok, true); assert.equal(result.code, HandoverCode.INCOMPLETE); assert.equal(result.handover.status, "pending_info"); assert.deepEqual(result.handover.acknowledgements, []);
  assert.deepEqual(result.handover.missingFields, ["scopeIncluded"]); assert.equal(result.handover.proposedOwnerId, "father"); assert.equal(result.handover.version, 4); assertOwnerUnchanged(result);
  assert.equal(reviseHandover({ domain, handover: pending, actorId: "mother", expectedVersion: 3, patch: { status: "accepted" } }).code, HandoverCode.INVALID_TRANSITION);
  assert.equal(reviseHandover({ domain, handover: pending, actorId: "grandmother", expectedVersion: 3, patch: {} }).code, HandoverCode.PERMISSION);
  assert.equal(reviseHandover({ domain, handover: pending, actorId: "father", expectedVersion: 2, patch: {} }).code, HandoverCode.CONFLICT);
});

test("only the current owner may redirect a proposal to a third person", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 3 };
  const before = clone(pending);
  const patch = { proposedOwnerId: "grandmother" };

  const confirmerRedirect = reviseHandover({ domain, handover: pending, actorId: "father", expectedVersion: 3, patch });
  assert.equal(confirmerRedirect.ok, false); assert.equal(confirmerRedirect.code, HandoverCode.PERMISSION); assert.equal(confirmerRedirect.handover.proposedOwnerId, "father"); assert.equal(confirmerRedirect.handover.version, 3);
  const thirdPartyRedirect = reviseHandover({ domain, handover: pending, actorId: "grandmother", expectedVersion: 3, patch });
  assert.equal(thirdPartyRedirect.ok, false); assert.equal(thirdPartyRedirect.code, HandoverCode.PERMISSION); assert.equal(thirdPartyRedirect.handover.proposedOwnerId, "father"); assert.equal(thirdPartyRedirect.handover.version, 3);

  const ownerRedirect = reviseHandover({ domain, handover: pending, actorId: "mother", expectedVersion: 3, patch });
  assert.equal(ownerRedirect.ok, true); assert.equal(ownerRedirect.handover.proposedOwnerId, "grandmother");
  assert.equal(ownerRedirect.handover.confirmationRequiredFromId, "grandmother"); assert.equal(ownerRedirect.handover.version, 4);
  assert.deepEqual(pending, before); assert.deepEqual(patch, { proposedOwnerId: "grandmother" });
});

test("revise can clear explicit missing information only after structural fields are complete", () => {
  const pending = { ...base, status: "pending_info", missingFields: ["scopeIncluded"], acknowledgements: [{ memberId: "father", handoverVersion: 3, acknowledgedAt: "2026-08-01T00:00:00.000Z" }], version: 3 };
  const before = clone(pending);
  const patch = { missingFields: [] };
  const beforePatch = clone(patch);
  const result = reviseHandover({ domain, handover: pending, actorId: "mother", expectedVersion: 3, patch });
  assert.equal(result.ok, true); assert.equal(result.code, HandoverCode.OK); assert.equal(result.handover.status, "pending_ack"); assert.deepEqual(result.handover.missingFields, []);
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
  assert.equal(declineHandover({ domain, handover: pending, actorId: "mother", expectedVersion: 5 }).code, HandoverCode.PERMISSION);
  assert.equal(declineHandover({ domain, handover: { ...pending, status: "pending_info" }, actorId: "father" }).code, HandoverCode.INVALID_TRANSITION);
  assert.equal(declineHandover({ domain, handover: pending, actorId: "father", expectedVersion: 4 }).code, HandoverCode.CONFLICT);
});

test("expiry applies only after the deadline and never changes owner", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 9 };
  const notExpired = expireHandover({ domain, handover: pending, now: "2026-09-01T00:00:00.000Z", expectedVersion: 9 });
  assert.equal(notExpired.code, HandoverCode.NOT_EXPIRED); assertOwnerUnchanged(notExpired);
  const expired = expireHandover({ domain, handover: pending, now: "2026-09-01T00:00:00.001Z", expectedVersion: 9 });
  assert.equal(expired.code, HandoverCode.OK); assert.equal(expired.handover.status, "expired"); assert.equal(expired.handover.confirmationRequiredFromId, null); assertOwnerUnchanged(expired);
  assert.equal(expireHandover({ domain, handover: { ...pending, status: "declined" }, now: "2026-10-01T00:00:00.000Z" }).code, HandoverCode.INVALID_TRANSITION);
  assert.equal(expireHandover({ domain, handover: pending, now: "invalid", expectedVersion: 9 }).code, HandoverCode.INVALID_INPUT);
  assert.equal(expireHandover({ domain, handover: pending, now: "2026-10-01T00:00:00.000Z", expectedVersion: 8 }).code, HandoverCode.CONFLICT);
});

test("expiry validates real instants and compares valid offsets", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 9 };
  for (const nowValue of ["2030-02-30T00:00:00Z", "2026-09-01T24:00:00Z", new Date("2026-09-01T00:00:00Z")]) {
    const result = expireHandover({ domain, handover: pending, now: nowValue, expectedVersion: 9 });
    assert.equal(result.ok, false); assert.equal(result.code, HandoverCode.INVALID_INPUT);
    assert.equal(result.handover.version, 9); assertOwnerUnchanged(result);
  }
  for (const expiresAt of ["2030-02-30T00:00:00Z", "2026-09-01T00:60:00Z", new Date("2026-09-01T00:00:00Z")]) {
    const result = expireHandover({
      domain,
      handover: { ...pending, expiresAt },
      now: "2026-10-01T00:00:00Z",
      expectedVersion: 9,
    });
    assert.equal(result.ok, false); assert.equal(result.code, HandoverCode.INVALID_INPUT);
    assert.equal(result.handover.version, 9); assertOwnerUnchanged(result);
  }
  const offsetExpiry = { ...pending, expiresAt: "2026-09-01T08:00:00+08:00" };
  assert.equal(expireHandover({
    domain, handover: offsetExpiry, now: "2026-09-01T00:00:00Z", expectedVersion: 9,
  }).code, HandoverCode.NOT_EXPIRED);
  assert.equal(expireHandover({
    domain, handover: offsetExpiry, now: "2026-09-01T00:00:00.001Z", expectedVersion: 9,
  }).code, HandoverCode.OK);
});

test("null expiry never expires a pending handover", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", expiresAt: null, version: 9 };
  const result = expireHandover({ domain, handover: pending, now: "9999-12-31T23:59:59.999Z", expectedVersion: 9 });
  assert.equal(result.ok, false); assert.equal(result.code, HandoverCode.NOT_EXPIRED); assert.equal(result.handover.status, "pending_ack");
  assert.equal(result.handover.version, 9); assertOwnerUnchanged(result);
});

test("all mutating commands reject omitted and zero expectedVersion without changing versions", () => {
  const pending = { ...base, status: "pending_ack", confirmationRequiredFromId: "father", version: 3 };
  const cases = [
    { currentVersion: 1, run: (expectedVersion) => submitHandover({ domain, handover: base, actorId: "mother", ...(expectedVersion === undefined ? {} : { expectedVersion }) }) },
    { currentVersion: 3, run: (expectedVersion) => reviseHandover({ domain, handover: pending, actorId: "father", patch: {}, ...(expectedVersion === undefined ? {} : { expectedVersion }) }) },
    { currentVersion: 3, run: (expectedVersion) => declineHandover({ domain, handover: pending, actorId: "father", ...(expectedVersion === undefined ? {} : { expectedVersion }) }) },
    { currentVersion: 3, run: (expectedVersion) => expireHandover({ domain, handover: pending, now: "2026-10-01T00:00:00.000Z", ...(expectedVersion === undefined ? {} : { expectedVersion }) }) },
  ];

  for (const { currentVersion, run } of cases) {
    for (const expectedVersion of [undefined, 0]) {
      const result = run(expectedVersion);
      assert.equal(result.ok, false); assert.equal(result.code, HandoverCode.CONFLICT); assertOwnerUnchanged(result);
      assert.equal(result.handover.version, currentVersion);
    }
  }
});

test("domain mismatch does not leak proposal data through errors", () => {
  const result = submitHandover({ domain, handover: { ...base, domainId: "other", privateProposal: "secret" }, actorId: "mother" });
  assert.deepEqual(Object.keys(result).sort(), ["code", "domain", "handover", "ok"]); assert.equal(result.code, HandoverCode.INVALID_TRANSITION);
  assert.equal("privateProposal" in result.handover, false);
});

test("all commands reject a handover bound to a stale domain version", () => {
  const stale = { ...base, expectedDomainVersion: 6 };
  assert.equal(submitHandover({ domain, handover: stale, actorId: "mother", expectedVersion: 1 }).code, HandoverCode.CONFLICT);
  const pending = { ...stale, status: "pending_ack", confirmationRequiredFromId: "father" };
  assert.equal(reviseHandover({ domain, handover: pending, actorId: "father", expectedVersion: 1, patch: {} }).code, HandoverCode.CONFLICT);
  assert.equal(declineHandover({ domain, handover: pending, actorId: "father", expectedVersion: 1 }).code, HandoverCode.CONFLICT);
  assert.equal(expireHandover({ domain, handover: pending, now: "2026-10-01T00:00:00.000Z", expectedVersion: 1 }).code, HandoverCode.CONFLICT);
});
