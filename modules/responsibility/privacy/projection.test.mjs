import assert from "node:assert/strict";
import test from "node:test";
import { createEvidence, grantFamilyConsent, projectAudit, projectResponsibilityState, revokeFamilyConsent } from "./projection.mjs";

const stamp = "2026-08-30T00:00:00.000Z";
const secret = "FORBIDDEN_PRIVATE_SENTINEL";
const base = (kind = "shareable_fact") => ({ id: "ev-1", familyId: "family-a", subjectId: "mother", creatorId: "mother", kind, version: 1, createdAt: stamp, updatedAt: stamp, fact: "Grandmother has a follow-up visit", expression: secret, rawText: secret, prompt: secret, metadata: { nested: secret } });
const state = (evidence) => ({
  members: [{ id: "mother", familyId: "family-a", role: "mother", status: "active" }, { id: "father", familyId: "family-a", role: "father", status: "active" }, { id: "grandmother", familyId: "family-a", role: "grandmother", status: "active" }, { id: "outsider", familyId: "family-b", role: "father", status: "active" }],
  evidence, domains: [{ id: "domain-1", familyId: "family-a", accountableOwnerId: "mother", version: 2, status: "active", notes: secret }],
  audit: [{ id: "audit-1", familyId: "family-a", status: "accepted", version: 2, createdAt: stamp, updatedAt: stamp, rawText: secret, nested: { prompt: secret, payload: { content: secret } } }],
});

test("evidence is private by default and only its subject can grant consent", () => {
  const created = createEvidence(base());
  assert.equal(created.ok, true);
  assert.equal(created.evidence.consents.length, 0);
  assert.equal(grantFamilyConsent(created.evidence, "father", stamp).error.code, "consent_forbidden");
  assert.equal(grantFamilyConsent(created.evidence, "mother", stamp).ok, true);
  assert.equal(grantFamilyConsent(createEvidence(base("private_expression")).evidence, "mother", stamp).error.code, "consent_not_shareable");
});

test("revocation removes family visibility and returned records are immutable", () => {
  const granted = grantFamilyConsent(createEvidence(base()).evidence, "mother", stamp).evidence;
  const revoked = revokeFamilyConsent(granted, "mother", stamp).evidence;
  assert.equal(projectResponsibilityState(state([revoked]), "father").projection.familyEvidence.length, 0);
  assert.throws(() => { revoked.consents.push({}); }, TypeError);
});

test("three family perspectives preserve private access and limit family access", () => {
  const granted = grantFamilyConsent(createEvidence(base()).evidence, "mother", stamp).evidence;
  const snapshot = state([granted]);
  assert.equal(projectResponsibilityState(snapshot, "mother").projection.privateEvidence.length, 1);
  assert.equal(projectResponsibilityState(snapshot, "father").projection.privateEvidence.length, 0);
  assert.equal(projectResponsibilityState(snapshot, "grandmother").projection.familyEvidence.length, 1);
  assert.equal(projectResponsibilityState(snapshot, "outsider").projection.familyEvidence.length, 0);
});

test("malformed consent and private expressions fail closed", () => {
  const expression = createEvidence(base("private_expression")).evidence;
  const malformed = { ...createEvidence(base()).evidence, consents: [{ status: "granted", evidenceId: "ev-1", familyId: "family-a", subjectId: "mother", version: 2, grantedAt: stamp, rawText: secret }] };
  assert.equal(projectResponsibilityState(state([expression, malformed]), "father").projection.familyEvidence.length, 0);
});

test("family and audit projections exclude nested leak attempts and sentinel strings", () => {
  const granted = grantFamilyConsent(createEvidence(base()).evidence, "mother", stamp).evidence;
  const projection = projectResponsibilityState(state([granted]), "father").projection;
  const audit = projectAudit(state([]).audit, "family-a");
  assert.equal(JSON.stringify(projection).includes(secret), false);
  assert.equal(JSON.stringify(audit).includes(secret), false);
  assert.deepEqual(Object.keys(audit[0]).sort(), ["createdAt", "familyId", "id", "status", "updatedAt", "version"]);
});
