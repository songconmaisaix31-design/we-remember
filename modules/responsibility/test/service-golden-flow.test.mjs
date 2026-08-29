import assert from "node:assert/strict";
import test from "node:test";

import {
  createGoldenResponsibilityFixture,
  createResponsibilityPorts,
  createResponsibilityService,
  createResponsibilityStore,
  goldenScenarioProvider,
  grantFixtureFamilyConsent,
} from "../index.mjs";

const FAMILY_ID = "family-willow";
const HANDOVER_ID = "handover-grandmother-follow-up-to-father";
const DOMAIN_ID = "domain-grandmother-follow-up";
const DOMAIN_TODO_ID = "todo-confirm-follow-up-logistics";
const EXPLICIT_TODO_ID = "todo-prepare-follow-up-questions";
const FACT_EVIDENCE_ID = "evidence-grandmother-follow-up-fact";
const PRIVATE_EXPRESSION = "I feel overwhelmed carrying all of Grandmother's follow-up coordination by myself.";

const mother = Object.freeze({ actorId: "mother", familyId: FAMILY_ID });
const father = Object.freeze({ actorId: "father", familyId: FAMILY_ID });

const findById = (items, id) => items.find((item) => item.id === id);

function consentedFixture() {
  const fixture = createGoldenResponsibilityFixture();
  const consented = grantFixtureFamilyConsent(fixture, {
    evidenceId: FACT_EVIDENCE_ID,
    actorId: "grandmother",
    consent: {
      id: "consent-grandmother-follow-up-fact",
      evidenceId: FACT_EVIDENCE_ID,
      subjectMemberId: "grandmother",
      grantedVisibility: "family",
      status: "granted",
      version: 1,
    },
  });
  assert.equal(consented.ok, true);
  return consented.nextState;
}

function createHarness(provider = goldenScenarioProvider) {
  const store = createResponsibilityStore(consentedFixture());
  const service = createResponsibilityService({
    store,
    ports: createResponsibilityPorts({ provider }),
  });
  return { service, store };
}

test("runs the golden flow through the real Store and Service factories", async () => {
  const { service, store } = createHarness();

  const suggestion = await service.suggest(mother, {
    text: PRIVATE_EXPRESSION,
    source: "private_message",
  });
  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.attempts, 1);
  assert.equal(store.currentRevision(), 0);

  const submitted = await service.submit(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 1,
    idempotencyKey: "service-submit-v1",
  });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.code, "incomplete");
  assert.equal(submitted.committed, true);
  assert.equal(submitted.replayed, false);
  assert.equal(submitted.revision, 1);
  let state = store.readSnapshot();
  assert.equal(findById(state.handovers, HANDOVER_ID).status, "pending_info");
  assert.equal(findById(state.domains, DOMAIN_ID).accountableOwnerId, "mother");

  const submitReplay = await service.submit(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 1,
    idempotencyKey: "service-submit-v1",
  });
  assert.equal(submitReplay.ok, true);
  assert.equal(submitReplay.replayed, true);
  assert.equal(submitReplay.revision, 1);
  assert.equal(store.currentRevision(), 1);

  const revised = await service.revise(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 2,
    patch: {
      missingFields: [],
      expiresAt: "2030-04-20T00:00:00.000Z",
    },
    idempotencyKey: "service-revise-v2",
  });
  assert.equal(revised.ok, true);
  assert.equal(revised.committed, true);
  assert.equal(revised.revision, 2);
  state = store.readSnapshot();
  assert.equal(findById(state.handovers, HANDOVER_ID).status, "pending_ack");
  assert.equal(findById(state.domains, DOMAIN_ID).accountableOwnerId, "mother");
  const pendingHandoverReminder = state.reminders.find((item) => item.sourceId === HANDOVER_ID);
  assert.equal(pendingHandoverReminder.recipientId, "father");
  assert.equal(pendingHandoverReminder.status, "pending");

  const accepted = await service.accept(father, {
    handoverId: HANDOVER_ID,
    expectedHandoverVersion: 3,
    expectedDomainVersion: 1,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "service-accept-v3",
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.code, "accepted");
  assert.equal(accepted.committed, true);
  assert.equal(accepted.replayed, false);
  assert.equal(accepted.revision, 3);
  assert.equal(Object.hasOwn(accepted, "idempotent"), false);

  state = store.readSnapshot();
  assert.equal(findById(state.domains, DOMAIN_ID).accountableOwnerId, "father");
  assert.equal(findById(state.handovers, HANDOVER_ID).status, "accepted");
  assert.equal(findById(state.todos, DOMAIN_TODO_ID).assigneeId, "father");
  assert.equal(findById(state.todos, EXPLICIT_TODO_ID).assigneeId, "agent");
  assert.equal(state.reminders.find((item) => item.sourceId === DOMAIN_TODO_ID).recipientId, "father");
  assert.equal(state.reminders.find((item) => item.sourceId === HANDOVER_ID).status, "completed");
  assert.equal(state.auditLog.length, 1);
  assert.equal(state.notices.length, 1);
  assert.equal(state.notices[0].recipientId, "mother");
  assert.equal(JSON.stringify(state.auditLog).includes(PRIVATE_EXPRESSION), false);

  const acceptedReplay = await service.accept(father, {
    handoverId: HANDOVER_ID,
    expectedHandoverVersion: 3,
    expectedDomainVersion: 1,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "service-accept-v3",
  });
  assert.equal(acceptedReplay.ok, true);
  assert.equal(acceptedReplay.replayed, true);
  assert.equal(acceptedReplay.revision, 3);
  assert.equal(store.currentRevision(), 3);
  state = store.readSnapshot();
  assert.equal(state.auditLog.length, 1);
  assert.equal(state.notices.length, 1);

  const conflictingReuse = await service.accept(father, {
    handoverId: HANDOVER_ID,
    expectedHandoverVersion: 4,
    expectedDomainVersion: 2,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "service-accept-v3",
  });
  assert.equal(conflictingReuse.ok, false);
  assert.equal(conflictingReuse.error.code, "idempotency_conflict");
  assert.equal(store.currentRevision(), 3);

  const fatherView = await service.view(father);
  assert.equal(fatherView.ok, true);
  assert.deepEqual(fatherView.projection.familyEvidence.map((item) => item.id), [FACT_EVIDENCE_ID]);
  assert.equal(fatherView.projection.privateEvidence.length, 0);
  assert.equal(fatherView.projection.audit.length, 1);
  assert.equal(JSON.stringify(fatherView).includes(PRIVATE_EXPRESSION), false);

  const completed = await service.completeTodo(father, {
    todoId: DOMAIN_TODO_ID,
    expectedVersion: 2,
    idempotencyKey: "service-complete-todo-v2",
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.committed, true);
  assert.equal(completed.revision, 4);
  state = store.readSnapshot();
  assert.equal(findById(state.todos, DOMAIN_TODO_ID).status, "completed");
  assert.equal(state.reminders.find((item) => item.sourceId === DOMAIN_TODO_ID).status, "cancelled");
});

test("manual fallback and unauthorized viewers never commit a snapshot", async () => {
  let providerCalls = 0;
  const { service, store } = createHarness(async () => {
    providerCalls += 1;
    return { invalid: true };
  });

  const manual = await service.suggest(mother, { text: PRIVATE_EXPRESSION });
  assert.equal(manual.status, "manual_required");
  assert.equal(manual.attempts, 2);
  assert.equal(providerCalls, 2);
  assert.equal(store.currentRevision(), 0);

  const unauthorized = await service.view({ actorId: "outsider", familyId: FAMILY_ID });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.error.code, "viewer_unauthorized");
  assert.equal(store.currentRevision(), 0);
});

test("Store-facing ports retain complete success snapshots but strip failure snapshots", () => {
  const state = consentedFixture();
  const ports = createResponsibilityPorts({ provider: goldenScenarioProvider });

  const failed = ports.submitHandover(state, {
    handoverId: HANDOVER_ID,
    actorId: "father",
    expectedVersion: 1,
  });
  assert.equal(failed.ok, false);
  assert.equal(Object.hasOwn(failed, "nextState"), false);

  const succeeded = ports.submitHandover(state, {
    handoverId: HANDOVER_ID,
    actorId: "mother",
    expectedVersion: 1,
  });
  assert.equal(succeeded.ok, true);
  assert.equal(Object.hasOwn(succeeded, "nextState"), true);
  assert.equal(findById(succeeded.nextState.handovers, HANDOVER_ID).status, "pending_info");
});
