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
const grandmother = Object.freeze({ actorId: "grandmother", familyId: FAMILY_ID });
const agent = Object.freeze({ actorId: "agent", familyId: FAMILY_ID });

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

function createHarness(provider = goldenScenarioProvider, initialState = consentedFixture()) {
  const store = createResponsibilityStore(initialState);
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

  const changedNowReuse = await service.accept(father, {
    handoverId: HANDOVER_ID,
    expectedHandoverVersion: 3,
    expectedDomainVersion: 1,
    now: "2030-04-11T00:00:00.000Z",
    idempotencyKey: "service-accept-v3",
  });
  assert.equal(changedNowReuse.ok, false);
  assert.equal(changedNowReuse.error.code, "idempotency_conflict");
  assert.equal(store.currentRevision(), 3);

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

  const [motherView, fatherView, grandmotherView] = await Promise.all([
    service.view(mother),
    service.view(father),
    service.view(grandmother),
  ]);
  assert.equal(fatherView.ok, true);
  assert.deepEqual(fatherView.projection.familyEvidence.map((item) => item.id), [FACT_EVIDENCE_ID]);
  assert.equal(fatherView.projection.privateEvidence.length, 0);
  assert.equal(fatherView.projection.audit.length, 1);
  assert.equal(JSON.stringify(fatherView).includes(PRIVATE_EXPRESSION), false);
  for (const view of [motherView, fatherView, grandmotherView]) {
    assert.equal(view.ok, true);
    assert.equal(view.projection.responsibility.accountableOwnerId, "father");
    assert.equal(view.projection.responsibility.domainTodoAssigneeId, "father");
    assert.equal(view.projection.responsibility.reminderRecipientId, "father");
    assert.equal(view.projection.responsibility.handoverStatus, "accepted");
    assert.equal(view.projection.responsibility.handoverReminderStatus, "completed");
  }
  assert.equal(motherView.projection.responsibility.oldOwnerNoticeIds.length, 1);
  assert.deepEqual(fatherView.projection.responsibility.oldOwnerNoticeIds, []);
  assert.deepEqual(grandmotherView.projection.responsibility.oldOwnerNoticeIds, []);

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

test("binds provider input to the server-resolved actor and family", async () => {
  const calls = [];
  const provider = async (input, context) => {
    calls.push({ input, context });
    return goldenScenarioProvider(input, context);
  };
  const { service, store } = createHarness(provider);

  const result = await service.suggest(mother, {
    actorId: "father",
    familyId: "another-family",
    text: PRIVATE_EXPRESSION,
  });

  assert.equal(result.status, "suggested");
  assert.equal(store.currentRevision(), 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.actorId, "mother");
  assert.equal(calls[0].input.familyId, FAMILY_ID);
});

test("rejects idempotency-key reuse when revise patches or expiry times differ", async () => {
  const reviseHarness = createHarness();
  await reviseHarness.service.submit(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 1,
    idempotencyKey: "fingerprint-submit",
  });
  const unknownPatch = await reviseHarness.service.revise(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 2,
    patch: { privatePayload: "must not enter an idempotency fingerprint" },
    idempotencyKey: "fingerprint-revise",
  });
  assert.equal(unknownPatch.ok, false);
  assert.equal(unknownPatch.error.code, "invalid_request");
  assert.equal(reviseHarness.store.currentRevision(), 1);
  const firstRevision = await reviseHarness.service.revise(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 2,
    patch: { missingFields: [], expiresAt: "2030-04-20T00:00:00.000Z" },
    idempotencyKey: "fingerprint-revise",
  });
  const changedPatch = await reviseHarness.service.revise(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 2,
    patch: { missingFields: [], expiresAt: "2030-05-20T00:00:00.000Z" },
    idempotencyKey: "fingerprint-revise",
  });
  assert.equal(firstRevision.ok, true);
  assert.equal(changedPatch.ok, false);
  assert.equal(changedPatch.error.code, "idempotency_conflict");
  assert.equal(reviseHarness.store.currentRevision(), 2);
  assert.equal(
    findById(reviseHarness.store.readSnapshot().handovers, HANDOVER_ID).expiresAt,
    "2030-04-20T00:00:00.000Z",
  );

  const expiryHarness = createHarness();
  await expiryHarness.service.submit(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 1,
    idempotencyKey: "expiry-submit",
  });
  await expiryHarness.service.revise(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 2,
    patch: { missingFields: [], expiresAt: "2030-04-12T00:00:00.000Z" },
    idempotencyKey: "expiry-revise",
  });
  const firstExpiry = await expiryHarness.service.expire(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 3,
    now: "2030-04-13T00:00:00.000Z",
    idempotencyKey: "fingerprint-expire",
  });
  const changedNow = await expiryHarness.service.expire(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 3,
    now: "2030-04-14T00:00:00.000Z",
    idempotencyKey: "fingerprint-expire",
  });
  assert.equal(firstExpiry.ok, true);
  assert.equal(changedNow.ok, false);
  assert.equal(changedNow.error.code, "idempotency_conflict");
  assert.equal(expiryHarness.store.currentRevision(), 3);
});

test("allows only the resolved assignee to complete a Todo", async () => {
  const { service, store } = createHarness();

  const fatherDenied = await service.completeTodo(father, {
    todoId: DOMAIN_TODO_ID,
    expectedVersion: 1,
    idempotencyKey: "father-cannot-complete-mother-todo",
  });
  const agentDomainDenied = await service.completeTodo(agent, {
    todoId: DOMAIN_TODO_ID,
    expectedVersion: 1,
    idempotencyKey: "agent-cannot-complete-domain-todo",
  });
  const motherAgentTodoDenied = await service.completeTodo(mother, {
    todoId: EXPLICIT_TODO_ID,
    expectedVersion: 1,
    idempotencyKey: "mother-cannot-complete-agent-todo",
  });
  for (const denied of [fatherDenied, agentDomainDenied, motherAgentTodoDenied]) {
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, "permission_denied");
  }
  assert.equal(store.currentRevision(), 0);

  const agentCompleted = await service.completeTodo(agent, {
    todoId: EXPLICIT_TODO_ID,
    expectedVersion: 1,
    idempotencyKey: "agent-completes-explicit-todo",
  });
  assert.equal(agentCompleted.ok, true);
  assert.equal(agentCompleted.committed, true);
  assert.equal(store.currentRevision(), 1);
  assert.equal(findById(store.readSnapshot().todos, EXPLICIT_TODO_ID).status, "completed");
});

test("fails closed before pending_ack for non-unique or non-human proposed owners", async () => {
  const invalidCases = [
    {
      label: "agent",
      mutate(state) {
        state.handovers[0].proposedOwnerId = "agent";
      },
    },
    {
      label: "missing",
      mutate(state) {
        state.handovers[0].proposedOwnerId = "missing-member";
      },
    },
    {
      label: "cross-family",
      mutate(state) {
        state.members.push({
          id: "other-family-member",
          familyId: "other-family",
          displayName: "Other Family Member",
          kind: "human",
          version: 1,
        });
        state.handovers[0].proposedOwnerId = "other-family-member";
      },
    },
    {
      label: "duplicate",
      mutate(state) {
        state.members.push({ ...state.members.find((member) => member.id === "father") });
      },
    },
  ];

  for (const invalidCase of invalidCases) {
    const state = structuredClone(consentedFixture());
    state.handovers[0].missingFields = [];
    invalidCase.mutate(state);
    const { service, store } = createHarness(goldenScenarioProvider, state);
    const result = await service.submit(mother, {
      handoverId: HANDOVER_ID,
      expectedVersion: 1,
      idempotencyKey: `invalid-owner-${invalidCase.label}`,
    });
    assert.equal(result.ok, false, invalidCase.label);
    assert.equal(result.error.code, "permission_denied", invalidCase.label);
    assert.equal(store.currentRevision(), 0, invalidCase.label);
    assert.equal(findById(store.readSnapshot().domains, DOMAIN_ID).accountableOwnerId, "mother");
  }

  const incompleteState = structuredClone(consentedFixture());
  incompleteState.handovers[0].proposedOwnerId = "";
  incompleteState.handovers[0].missingFields = [];
  const incompleteHarness = createHarness(goldenScenarioProvider, incompleteState);
  const incomplete = await incompleteHarness.service.submit(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 1,
    idempotencyKey: "empty-owner-remains-incomplete",
  });
  assert.equal(incomplete.ok, true);
  assert.equal(incomplete.code, "incomplete");
  assert.equal(
    findById(incompleteHarness.store.readSnapshot().handovers, HANDOVER_ID).status,
    "pending_info",
  );
});

test("preserves terminal reminders and re-derives domain reviews on acceptance", async () => {
  const state = structuredClone(consentedFixture());
  state.domainReviews = [{
    id: "review-grandmother-follow-up",
    familyId: FAMILY_ID,
    domainId: DOMAIN_ID,
    version: 1,
    scheduledAt: null,
  }];
  state.reminders.push({
    id: "event:event-grandmother-follow-up:grandmother:1",
    sourceType: "event",
    sourceId: "event-grandmother-follow-up",
    sourceVersion: 1,
    routingBasis: "event_participant",
    recipientId: "grandmother",
    status: "completed",
  });
  const { service, store } = createHarness(goldenScenarioProvider, state);

  await service.submit(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 1,
    idempotencyKey: "reminder-submit",
  });
  assert.equal(
    store.readSnapshot().reminders.find((item) => item.sourceType === "event").status,
    "completed",
  );
  await service.revise(mother, {
    handoverId: HANDOVER_ID,
    expectedVersion: 2,
    patch: { missingFields: [], expiresAt: "2030-04-20T00:00:00.000Z" },
    idempotencyKey: "reminder-revise",
  });
  await service.accept(father, {
    handoverId: HANDOVER_ID,
    expectedHandoverVersion: 3,
    expectedDomainVersion: 1,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "reminder-accept",
  });

  const reminders = store.readSnapshot().reminders;
  assert.equal(reminders.find((item) => item.sourceType === "event").status, "completed");
  assert.equal(reminders.find((item) => item.sourceType === "handover").status, "completed");
  const reviewPlans = reminders.filter((item) => item.sourceType === "domain_review");
  assert.deepEqual(reviewPlans.map((item) => [item.recipientId, item.status]), [["father", "pending"]]);
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
