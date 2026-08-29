import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptFixtureHandover,
  createGoldenResponsibilityFixture,
  deriveFixtureReminders,
  reviseFixtureHandover,
  submitFixtureHandover,
} from "../fixture.mjs";
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

function liveAcceptedState(overrides = {}) {
  return state([], [], {
    domains: [{
      id: "domain-1", familyId: "family-a", accountableOwnerId: "father", status: "active",
      visibility: "family", version: 3,
    }],
    handovers: [{
      id: "handover-1", familyId: "family-a", domainId: "domain-1", fromOwnerId: "mother",
      proposedOwnerId: "father", status: "accepted", confirmationRequiredFromId: null,
      expectedDomainVersion: 2, version: 5,
    }],
    todos: [],
    events: [],
    domainReviews: [],
    reminders: [],
    notices: [],
    ...overrides,
  });
}

function pendingFixture() {
  const submitted = submitFixtureHandover(createGoldenResponsibilityFixture(), {
    handoverId: "handover-grandmother-follow-up-to-father",
    actorId: "mother",
    expectedVersion: 1,
  });
  const revised = reviseFixtureHandover(submitted.nextState, {
    handoverId: "handover-grandmother-follow-up-to-father",
    actorId: "mother",
    expectedVersion: 2,
    patch: { missingFields: [], expiresAt: "2030-04-20T00:00:00.000Z" },
  });
  return deriveFixtureReminders(revised.nextState).nextState;
}

function acceptedFixture() {
  return acceptFixtureHandover(pendingFixture(), {
    handoverId: "handover-grandmother-follow-up-to-father",
    actorId: "father",
    expectedHandoverVersion: 3,
    expectedDomainVersion: 1,
    idempotencyKey: "privacy-accepted-fixture",
    now: "2030-04-10T00:00:00.000Z",
  }).nextState;
}

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

test("full viewer context rejects duplicate, ambiguous, cross-family, and state-family mismatches", () => {
  const base = state([], [], { familyId: "family-a" });
  assert.equal(projectResponsibilityState(base, { actorId: "mother", familyId: "family-a" }).ok, true);
  assert.equal(projectResponsibilityState(base, { actorId: "mother", familyId: "family-b" }).error.code, "viewer_unauthorized");
  assert.equal(projectResponsibilityState({ ...base, familyId: "family-b" }, { actorId: "mother", familyId: "family-a" }).error.code, "viewer_unauthorized");

  const crossFamilyDuplicate = {
    ...base,
    members: [member("mother", "family-b"), ...base.members],
  };
  assert.equal(projectResponsibilityState(crossFamilyDuplicate, { actorId: "mother", familyId: "family-a" }).error.code, "viewer_unauthorized");
  assert.equal(projectResponsibilityState(crossFamilyDuplicate, "mother").error.code, "viewer_unauthorized");

  const sameFamilyDuplicate = {
    ...base,
    members: [member("mother"), ...base.members],
  };
  assert.equal(projectResponsibilityState(sameFamilyDuplicate, { actorId: "mother", familyId: "family-a" }).error.code, "viewer_unauthorized");
});

test("derives current responsibility state and scopes reminders and notices to the viewer", () => {
  const accepted = acceptedFixture();
  const mother = projectResponsibilityState(accepted, { actorId: "mother", familyId: "family-willow" }).projection;
  const father = projectResponsibilityState(accepted, { actorId: "father", familyId: "family-willow" }).projection;
  const grandmother = projectResponsibilityState(accepted, { actorId: "grandmother", familyId: "family-willow" }).projection;

  for (const projection of [mother, father, grandmother]) {
    assert.deepEqual(projection.domains, [{
      id: "domain-grandmother-follow-up",
      accountableOwnerId: "father",
      status: "active",
      version: 2,
    }]);
    assert.equal(projection.handovers[0].status, "accepted");
    assert.equal(projection.handovers[0].confirmationRequiredFromId, null);
    assert.equal(projection.todos.find((item) => item.id === "todo-confirm-follow-up-logistics").assigneeId, "father");
    assert.equal(projection.todos.find((item) => item.id === "todo-confirm-follow-up-logistics").assignmentBasis, "domain_owner");
  }

  assert.deepEqual(mother.reminders, []);
  assert.deepEqual(mother.notices.map((item) => item.type), ["handover_accepted"]);
  assert.equal(father.reminders.every((item) => item.recipientId === "father"), true);
  assert.deepEqual(new Set(father.reminders.map((item) => item.sourceType)), new Set(["todo", "handover"]));
  assert.deepEqual(father.notices, []);
  assert.equal(grandmother.reminders.every((item) => item.recipientId === "grandmother"), true);
  assert.deepEqual(grandmother.reminders.map((item) => item.sourceType), ["event"]);
  assert.deepEqual(grandmother.notices, []);
});

test("reminder projection rejects recipients that disagree with each live source", () => {
  const snapshot = structuredClone(pendingFixture());
  snapshot.domainReviews = [{
    id: "review-grandmother-follow-up",
    familyId: "family-willow",
    domainId: "domain-grandmother-follow-up",
    scheduledAt: null,
    version: 1,
  }];
  snapshot.reminders = [
    { id: "forged-event", sourceType: "event", sourceId: "event-grandmother-follow-up", sourceVersion: 1, routingBasis: "event_participant", recipientId: "father", status: "pending" },
    { id: "forged-todo", sourceType: "todo", sourceId: "todo-confirm-follow-up-logistics", sourceVersion: 1, routingBasis: "todo_assignee", recipientId: "father", status: "pending" },
    { id: "forged-review", sourceType: "domain_review", sourceId: "review-grandmother-follow-up", sourceVersion: 1, routingBasis: "domain_owner", recipientId: "father", status: "pending" },
    { id: "forged-handover", sourceType: "handover", sourceId: "handover-grandmother-follow-up-to-father", sourceVersion: 3, routingBasis: "handover_confirmer", recipientId: "mother", status: "pending" },
    { id: "valid-review", sourceType: "domain_review", sourceId: "review-grandmother-follow-up", sourceVersion: 1, routingBasis: "domain_owner", recipientId: "mother", status: "pending" },
    { id: "valid-handover", sourceType: "handover", sourceId: "handover-grandmother-follow-up-to-father", sourceVersion: 3, routingBasis: "handover_confirmer", recipientId: "father", status: "pending" },
  ];

  assert.deepEqual(
    projectResponsibilityState(snapshot, { actorId: "father", familyId: "family-willow" }).projection.reminders.map((item) => item.id),
    ["valid-handover"],
  );
  assert.deepEqual(
    projectResponsibilityState(snapshot, { actorId: "mother", familyId: "family-willow" }).projection.reminders.map((item) => item.id),
    ["valid-review"],
  );
});

test("responsibility records are rebuilt from closed fields without evidence or nested metadata", () => {
  const unsafe = structuredClone(acceptedFixture());
  for (const collection of [unsafe.domains, unsafe.handovers, unsafe.todos, unsafe.reminders, unsafe.notices]) {
    for (const item of collection) {
      item.metadata = { nested: { content: secret } };
      item.privateExpression = secret;
    }
  }
  const projection = projectResponsibilityState(unsafe, { actorId: "father", familyId: "family-willow" }).projection;
  const responsibility = {
    domains: projection.domains,
    handovers: projection.handovers,
    todos: projection.todos,
    reminders: projection.reminders,
    notices: projection.notices,
  };
  assert.equal(JSON.stringify(responsibility).includes(secret), false);
  assert.deepEqual(Object.keys(projection.domains[0]).sort(), ["accountableOwnerId", "id", "status", "version"]);
  assert.deepEqual(Object.keys(projection.todos[0]).sort(), ["assigneeId", "assignmentBasis", "domainId", "id", "status", "version"]);
});

test("auditLog wins over legacy audit and exposes only safe acceptance metadata", () => {
  const snapshot = liveAcceptedState({
    evidence: [createEvidence(evidence()).evidence],
    consents: [consent()],
    audit: [{ ...acceptedAudit, id: "legacy-audit" }],
  });
  const projection = projectResponsibilityState(snapshot, "father").projection;
  const audit = projectAudit(snapshot.auditLog, "family-a", snapshot);
  assert.deepEqual(Object.keys(audit[0]).sort(), ["action", "actorId", "entityId", "entityType", "familyId", "id", "metadata", "occurredAt"]);
  assert.deepEqual(audit[0].metadata, acceptedMetadata);
  assert.deepEqual(projection.audit, audit);
  assert.equal(projection.audit[0].id, "audit:handover-1:5");
  assert.equal(JSON.stringify(projection).includes(secret), false);
  assert.equal(JSON.stringify(audit).includes(secret), false);
  assert.throws(() => { audit[0].metadata.status = "changed"; }, TypeError);
  assert.throws(() => { projection.familyEvidence.push({}); }, TypeError);
});

test("audit projection rejects unknown actions, mismatched entity types, unsafe IDs, statuses, and versions", () => {
  const snapshot = liveAcceptedState();
  assert.deepEqual(projectAudit([{ ...acceptedAudit, action: secret }], "family-a", snapshot), []);
  assert.deepEqual(projectAudit([{ ...acceptedAudit, entityType: "todo" }], "family-a", snapshot), []);
  assert.deepEqual(projectAudit([{ ...acceptedAudit, actorId: `father ${secret}` }], "family-a", snapshot), []);
  assert.deepEqual(projectAudit([{ ...acceptedAudit, actorId: secret, metadata: { ...acceptedMetadata, proposedOwnerId: secret } }], "family-a", snapshot), []);
  assert.deepEqual(projectAudit([{ ...acceptedAudit, id: "audit:handover-other:5" }], "family-a", snapshot), []);
  assert.deepEqual(projectAudit([{ ...acceptedAudit, metadata: { ...acceptedMetadata, status: secret } }], "family-a", snapshot), []);
  assert.deepEqual(projectAudit([{ ...acceptedAudit, metadata: { ...acceptedMetadata, domainVersion: -1 } }], "family-a", snapshot), []);
});

test("audit projection requires matching live accepted handover and domain state", () => {
  const valid = liveAcceptedState();
  assert.equal(projectAudit([acceptedAudit], "family-a", valid).length, 1);
  assert.deepEqual(projectAudit([acceptedAudit], "family-a"), []);

  const conflictingStates = [
    { ...valid, handovers: [{ ...valid.handovers[0], status: "draft", version: 1 }] },
    { ...valid, handovers: [{ ...valid.handovers[0], proposedOwnerId: "grandmother" }] },
    { ...valid, handovers: [{ ...valid.handovers[0], expectedDomainVersion: 1 }] },
    { ...valid, domains: [{ ...valid.domains[0], accountableOwnerId: "mother" }] },
    { ...valid, domains: [{ ...valid.domains[0], version: 4 }] },
  ];
  for (const snapshot of conflictingStates) {
    assert.deepEqual(projectAudit([acceptedAudit], "family-a", snapshot), []);
    assert.deepEqual(projectResponsibilityState(snapshot, { actorId: "father", familyId: "family-a" }).projection.audit, []);
  }
});

test("timestamps require a real ISO calendar instant and support explicit offsets", () => {
  const snapshot = liveAcceptedState();
  const offsetAudit = { ...acceptedAudit, occurredAt: "2026-08-30T08:00:00+08:00" };
  assert.equal(projectAudit([offsetAudit], "family-a", snapshot).length, 1);

  for (const occurredAt of [
    "2026-02-30T00:00:00.000Z",
    "2026-08-30T24:00:00.000Z",
    "August 30, 2026",
    new Date("2026-08-30T00:00:00.000Z"),
  ]) {
    assert.deepEqual(projectAudit([{ ...acceptedAudit, occurredAt }], "family-a", snapshot), []);
  }

  const accepted = structuredClone(acceptedFixture());
  accepted.notices[0].createdAt = "2030-02-30T00:00:00.000Z";
  assert.deepEqual(
    projectResponsibilityState(accepted, { actorId: "mother", familyId: "family-willow" }).projection.notices,
    [],
  );
});
