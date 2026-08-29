import assert from "node:assert/strict";
import test from "node:test";
import { createEvidence, grantFamilyConsent, projectAudit, projectResponsibilityState, revokeFamilyConsent } from "./projection.mjs";

const secret = "FORBIDDEN_PRIVATE_SENTINEL";
const evidenceKeys = ["content", "createdByMemberId", "familyId", "id", "kind", "subjectMemberId", "version", "visibility"];
const consentKeys = ["evidenceId", "grantedVisibility", "id", "status", "subjectMemberId", "version"];
const memberKeys = ["displayName", "familyId", "id", "kind", "version"];
const evidence = (kind = "shareable_fact", id = "evidence-1") => ({ id, familyId: "family-a", subjectMemberId: "mother", createdByMemberId: "mother", kind, content: kind === "shareable_fact" ? "Grandmother has a follow-up visit" : secret, version: 1 });
const consent = (status = "granted", id = "consent-1") => ({ id, evidenceId: "evidence-1", subjectMemberId: "mother", grantedVisibility: "family", status, version: 1 });
const member = (id, familyId = "family-a", kind = "human") => Object.freeze({ id, familyId, displayName: id[0].toUpperCase() + id.slice(1), kind, version: 1 });
const acceptedMetadata = Object.freeze({ handoverId: "handover-1", domainId: "domain-1", fromOwnerId: "mother", proposedOwnerId: "father", status: "accepted", previousDomainVersion: 2, domainVersion: 3, handoverVersion: 5 });
const acceptedAudit = Object.freeze({
  id: "audit:handover-1:5", familyId: "family-a", actorId: "father", action: "handover.accepted", entityType: "handover", entityId: "handover-1", occurredAt: "2026-08-30T00:00:00.000Z",
  metadata: { ...acceptedMetadata, nested: { content: secret }, rawText: secret, prompt: secret },
});
const state = (items, consents = [], overrides = {}) => ({
  members: [member("mother"), member("father"), member("grandmother"), member("agent", "family-a", "agent"), member("outsider", "family-b")],
  evidence: items,
  consents,
  auditLog: [acceptedAudit],
  ...overrides,
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

test("exact-contract human Members support mother, father, and grandmother perspectives", () => {
  const snapshot = state([createEvidence(evidence()).evidence], [consent()]);
  for (const id of ["mother", "father", "grandmother"]) {
    assert.deepEqual(Object.keys(snapshot.members.find((item) => item.id === id)).sort(), memberKeys);
    const result = projectResponsibilityState(snapshot, id);
    assert.equal(result.ok, true);
    assert.deepEqual(result.projection.viewer, { id, role: id });
    assert.equal(result.projection.privateEvidence.length, id === "mother" ? 1 : 0);
    assert.equal(result.projection.familyEvidence.length, 1);
  }
  const outsider = projectResponsibilityState(snapshot, "outsider").projection;
  assert.deepEqual(outsider.privateEvidence, []);
  assert.deepEqual(outsider.familyEvidence, []);
  assert.deepEqual(outsider.audit, []);
});

test("agent and inactive runtime viewers are rejected; active optional role is presentation-only", () => {
  const snapshot = state([], [], { members: [member("agent", "family-a", "agent"), { ...member("inactive"), role: "mother", status: "inactive" }, { ...member("active-viewer"), role: "father", status: "active" }] });
  assert.equal(projectResponsibilityState(snapshot, "agent").error.code, "viewer_unauthorized");
  assert.equal(projectResponsibilityState(snapshot, "inactive").error.code, "viewer_unauthorized");
  assert.deepEqual(projectResponsibilityState(snapshot, "active-viewer").projection.viewer, { id: "active-viewer", role: "father" });
});

test("auditLog wins over legacy audit and exposes only safe acceptance metadata", () => {
  const snapshot = state([createEvidence(evidence()).evidence], [consent()], { audit: [{ ...acceptedAudit, id: "legacy-audit" }] });
  const projection = projectResponsibilityState(snapshot, "father").projection;
  const audit = projectAudit(snapshot.auditLog, "family-a");
  assert.deepEqual(Object.keys(audit[0]).sort(), ["action", "actorId", "entityId", "entityType", "familyId", "id", "metadata", "occurredAt"]);
  assert.deepEqual(audit[0].metadata, acceptedMetadata);
  assert.deepEqual(projection.audit, audit);
  assert.equal(projection.audit[0].id, "audit:handover-1:5");
  assert.equal(JSON.stringify(projection).includes(secret), false);
  assert.equal(JSON.stringify(audit).includes(secret), false);
  assert.throws(() => { audit[0].metadata.status = "changed"; }, TypeError);
  assert.throws(() => { projection.familyEvidence.push({}); }, TypeError);
});
