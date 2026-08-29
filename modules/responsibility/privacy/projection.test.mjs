import assert from "node:assert/strict";
import test from "node:test";
import { createEvidence, grantFamilyConsent, projectAudit, projectResponsibilityState, revokeFamilyConsent } from "./projection.mjs";

const secret = "FORBIDDEN_PRIVATE_SENTINEL";
const evidenceKeys = ["content", "createdByMemberId", "familyId", "id", "kind", "subjectMemberId", "version", "visibility"];
const consentKeys = ["evidenceId", "grantedVisibility", "id", "status", "subjectMemberId", "version"];
const evidence = (kind = "shareable_fact", id = "evidence-1") => ({ id, familyId: "family-a", subjectMemberId: "mother", createdByMemberId: "mother", kind, content: kind === "shareable_fact" ? "Grandmother has a follow-up visit" : secret, version: 1 });
const consent = (status = "granted", id = "consent-1") => ({ id, evidenceId: "evidence-1", subjectMemberId: "mother", grantedVisibility: "family", status, version: 1 });
const state = (items, consents = []) => ({
  members: [{ id: "mother", familyId: "family-a", role: "mother", status: "active" }, { id: "father", familyId: "family-a", role: "father", status: "active" }, { id: "grandmother", familyId: "family-a", role: "grandmother", status: "active" }, { id: "outsider", familyId: "family-b", role: "father", status: "active" }], evidence: items, consents,
  audit: [{ id: "audit-1", familyId: "family-a", actorId: "mother", action: "handover.accepted", entityType: "handover", entityId: "handover-1", occurredAt: "2026-08-30T00:00:00.000Z", metadata: { domainId: "domain-1", proposedOwnerId: "father", status: "accepted", version: 2, domainVersion: 3, previousDomainVersion: 2, nested: { content: secret }, rawText: secret, prompt: secret } }],
});

test("Evidence is exact-contract and private by default; Consent is separate", () => {
  const created = createEvidence(evidence());
  assert.equal(created.ok, true); assert.deepEqual(Object.keys(created.evidence).sort(), evidenceKeys); assert.equal(created.evidence.visibility, "private"); assert.equal("consents" in created.evidence, false);
  const granted = grantFamilyConsent(created.evidence, "mother", consent());
  assert.equal(granted.ok, true); assert.deepEqual(Object.keys(granted.consent).sort(), consentKeys); assert.equal(grantFamilyConsent(created.evidence, "father", consent()).error.code, "consent_forbidden");
});

test("all three evidence kinds are private unless an eligible fact has separate consent", () => {
  const fact = createEvidence(evidence()).evidence;
  const expression = createEvidence(evidence("private_expression", "expression-1")).evidence;
  const request = createEvidence(evidence("responsibility_request", "request-1")).evidence;
  const requestConsent = { ...consent("granted", "consent-request"), evidenceId: request.id };
  const snapshot = state([fact, expression, request], [consent(), requestConsent]);
  assert.deepEqual(projectResponsibilityState(snapshot, "father").projection.familyEvidence.map((item) => item.kind), ["shareable_fact"]);
  assert.equal(projectResponsibilityState(snapshot, "mother").projection.privateEvidence.length, 3);
});

test("revoked and malformed consent fail closed", () => {
  const fact = createEvidence(evidence()).evidence;
  const revoked = revokeFamilyConsent(fact, "mother", consent("revoked")).consent;
  const malformed = { ...consent(), evidenceId: "wrong-evidence" };
  assert.equal(projectResponsibilityState(state([fact], [revoked]), "father").projection.familyEvidence.length, 0);
  assert.equal(projectResponsibilityState(state([fact], [malformed]), "father").projection.familyEvidence.length, 0);
  assert.equal(projectResponsibilityState(state([fact], [consent(), { ...consent("revoked", "consent-2"), version: 2 }]), "father").projection.familyEvidence.length, 0);
});

test("mother, father, grandmother projections retain roles only as presentation metadata", () => {
  const snapshot = state([createEvidence(evidence()).evidence], [consent()]);
  for (const [id, role] of [["mother", "mother"], ["father", "father"], ["grandmother", "grandmother"]]) assert.equal(projectResponsibilityState(snapshot, id).projection.viewer.role, role);
  assert.equal(projectResponsibilityState(snapshot, "outsider").projection.familyEvidence.length, 0);
});

test("audit uses exact fields and its metadata is a scalar closed allowlist without sentinel leaks", () => {
  const projection = projectResponsibilityState(state([createEvidence(evidence()).evidence], [consent()]), "father").projection;
  const audit = projectAudit(state([], []).audit, "family-a");
  assert.deepEqual(Object.keys(audit[0]).sort(), ["action", "actorId", "entityId", "entityType", "familyId", "id", "metadata", "occurredAt"]);
  assert.deepEqual(audit[0].metadata, { domainId: "domain-1", proposedOwnerId: "father", status: "accepted", version: 2, domainVersion: 3, previousDomainVersion: 2 }); assert.equal(JSON.stringify(projection).includes(secret), false); assert.equal(JSON.stringify(audit).includes(secret), false); assert.throws(() => { audit[0].metadata.status = "changed"; }, TypeError);
  assert.throws(() => { projection.familyEvidence.push({}); }, TypeError);
});
