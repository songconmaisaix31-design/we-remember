import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCEPT_HANDOVER_FAILURE,
  acceptFixtureHandover,
  analyzeResponsibility,
  completeFixtureTodo,
  createGoldenResponsibilityFixture,
  declineFixtureHandover,
  deriveFixtureReminders,
  expireFixtureHandover,
  goldenScenarioProvider,
  grantFixtureFamilyConsent,
  projectResponsibilityState,
  reviseFixtureHandover,
  submitFixtureHandover,
} from "../index.mjs";

const PRIVATE_EXPRESSION = "I feel overwhelmed carrying all of Grandmother's follow-up coordination by myself.";
const PRIVATE_REQUEST = "Please ask Father to take over the follow-up coordination.";
const HANDOVER_ID = "handover-grandmother-follow-up-to-father";
const DOMAIN_ID = "domain-grandmother-follow-up";
const DOMAIN_TODO_ID = "todo-confirm-follow-up-logistics";
const EXPLICIT_TODO_ID = "todo-prepare-follow-up-questions";
const FACT_EVIDENCE_ID = "evidence-grandmother-follow-up-fact";

const findById = (items, id) => items.find((item) => item.id === id);

function submitAndCompleteProposal(state, expiresAt = null) {
  const submitted = submitFixtureHandover(state, {
    handoverId: HANDOVER_ID,
    actorId: "mother",
    expectedVersion: 1,
  });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.code, "incomplete");
  assert.equal(submitted.handover.status, "pending_info");
  assert.equal(findById(submitted.nextState.domains, DOMAIN_ID).accountableOwnerId, "mother");

  const revised = reviseFixtureHandover(submitted.nextState, {
    handoverId: HANDOVER_ID,
    actorId: "mother",
    expectedVersion: 2,
    patch: { missingFields: [], expiresAt },
  });
  assert.equal(revised.ok, true);
  assert.equal(revised.handover.status, "pending_ack");
  assert.equal(revised.handover.confirmationRequiredFromId, "father");
  assert.equal(findById(revised.nextState.domains, DOMAIN_ID).accountableOwnerId, "mother");
  return revised.nextState;
}

test("runs the available golden P0 flow without a Store or Service API", async () => {
  let state = createGoldenResponsibilityFixture();

  const analysis = await analyzeResponsibility({
    provider: goldenScenarioProvider,
    input: { actorId: "mother", text: PRIVATE_EXPRESSION },
    members: state.members,
  });
  assert.equal(analysis.status, "suggested");
  assert.equal(analysis.attempts, 1);
  assert.deepEqual(analysis.suggestion.missingFields, ["time", "scope"]);
  assert.deepEqual(analysis.suggestion.privateExpressions, [
    "Mother feels overwhelmed carrying the follow-up burden alone.",
  ]);
  assert.equal(JSON.stringify(analysis.suggestion.shareableFacts).includes("overwhelmed"), false);

  const motherBefore = projectResponsibilityState(state, "mother");
  const fatherBefore = projectResponsibilityState(state, "father");
  const grandmotherBefore = projectResponsibilityState(state, "grandmother");
  assert.equal(motherBefore.projection.privateEvidence.length, 3);
  assert.equal(fatherBefore.projection.privateEvidence.length, 0);
  assert.deepEqual(grandmotherBefore.projection.privateEvidence.map((item) => item.id), [FACT_EVIDENCE_ID]);
  assert.equal(JSON.stringify(fatherBefore).includes(PRIVATE_EXPRESSION), false);
  assert.equal(JSON.stringify(grandmotherBefore).includes(PRIVATE_REQUEST), false);

  const consented = grantFixtureFamilyConsent(state, {
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
  state = consented.nextState;
  const fatherAfterConsent = projectResponsibilityState(state, "father");
  assert.deepEqual(fatherAfterConsent.projection.familyEvidence.map((item) => item.id), [FACT_EVIDENCE_ID]);
  assert.equal(JSON.stringify(fatherAfterConsent).includes(PRIVATE_EXPRESSION), false);

  const pendingInfo = submitFixtureHandover(state, {
    handoverId: HANDOVER_ID,
    actorId: "mother",
    expectedVersion: 1,
  });
  assert.equal(pendingInfo.ok, true);
  assert.equal(pendingInfo.handover.status, "pending_info");
  state = pendingInfo.nextState;

  const staleRevision = reviseFixtureHandover(state, {
    handoverId: HANDOVER_ID,
    actorId: "mother",
    expectedVersion: 1,
    patch: { missingFields: [] },
  });
  assert.equal(staleRevision.ok, false);
  assert.equal(staleRevision.code, "conflict");
  assert.strictEqual(staleRevision.nextState, state);
  assert.equal(findById(state.domains, DOMAIN_ID).accountableOwnerId, "mother");

  const pendingAck = reviseFixtureHandover(state, {
    handoverId: HANDOVER_ID,
    actorId: "mother",
    expectedVersion: 2,
    patch: { missingFields: [], expiresAt: "2030-04-20T00:00:00.000Z" },
  });
  assert.equal(pendingAck.ok, true);
  assert.equal(pendingAck.handover.status, "pending_ack");
  assert.equal(pendingAck.handover.version, 3);
  state = pendingAck.nextState;

  const reminders = deriveFixtureReminders(state);
  assert.equal(reminders.ok, true);
  state = reminders.nextState;
  assert.deepEqual(
    state.reminders.map(({ sourceType, recipientId }) => ({ sourceType, recipientId })),
    [
      { sourceType: "event", recipientId: "grandmother" },
      { sourceType: "handover", recipientId: "father" },
      { sourceType: "todo", recipientId: "mother" },
      { sourceType: "todo", recipientId: "agent" },
    ],
  );

  const acceptanceCommand = {
    handoverId: HANDOVER_ID,
    actorId: "father",
    expectedHandoverVersion: 3,
    expectedDomainVersion: 1,
    idempotencyKey: "accept-grandmother-follow-up-v3",
    now: "2030-04-10T00:00:00.000Z",
  };
  const staleAcceptance = acceptFixtureHandover(state, {
    ...acceptanceCommand,
    expectedHandoverVersion: 2,
    idempotencyKey: "accept-grandmother-follow-up-stale",
  });
  assert.equal(staleAcceptance.ok, false);
  assert.equal(staleAcceptance.code, ACCEPT_HANDOVER_FAILURE.VERSION);
  assert.strictEqual(staleAcceptance.nextState, state);
  assert.equal(findById(state.domains, DOMAIN_ID).accountableOwnerId, "mother");

  const accepted = acceptFixtureHandover(state, acceptanceCommand);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.idempotent, false);
  const acceptedState = accepted.nextState;
  assert.notStrictEqual(acceptedState, state);
  assert.equal(findById(state.domains, DOMAIN_ID).accountableOwnerId, "mother");
  assert.equal(findById(acceptedState.domains, DOMAIN_ID).accountableOwnerId, "father");
  assert.equal(findById(acceptedState.domains, DOMAIN_ID).version, 2);
  assert.equal(findById(acceptedState.handovers, HANDOVER_ID).status, "accepted");
  assert.equal(findById(acceptedState.handovers, HANDOVER_ID).version, 4);

  const migratedTodo = findById(acceptedState.todos, DOMAIN_TODO_ID);
  const explicitTodo = findById(acceptedState.todos, EXPLICIT_TODO_ID);
  assert.equal(migratedTodo.assigneeId, "father");
  assert.equal(migratedTodo.version, 2);
  assert.equal(explicitTodo.assigneeId, "agent");
  assert.equal(explicitTodo.version, 1);
  const migratedReminder = acceptedState.reminders.find((item) => item.sourceId === DOMAIN_TODO_ID);
  const handoverReminder = acceptedState.reminders.find((item) => item.sourceId === HANDOVER_ID);
  assert.equal(migratedReminder.recipientId, "father");
  assert.equal(migratedReminder.sourceVersion, 2);
  assert.equal(handoverReminder.status, "completed");
  assert.equal(handoverReminder.sourceVersion, 4);
  assert.equal(acceptedState.reminders.some((item) => item.sourceId === DOMAIN_TODO_ID && item.status === "pending" && item.recipientId === "mother"), false);

  assert.equal(acceptedState.notices.length, 1);
  assert.equal(acceptedState.notices[0].recipientId, "mother");
  assert.equal(acceptedState.auditLog.length, 1);
  assert.equal(acceptedState.auditLog[0].action, "handover.accepted");
  assert.equal(JSON.stringify(acceptedState.auditLog).includes(PRIVATE_EXPRESSION), false);
  assert.equal(JSON.stringify(acceptedState.auditLog).includes(PRIVATE_REQUEST), false);

  for (const perspectiveId of ["mother", "father", "grandmother"]) {
    const projected = projectResponsibilityState(acceptedState, perspectiveId);
    assert.equal(projected.ok, true);
    assert.equal(projected.projection.audit.length, 1);
    assert.deepEqual(projected.projection.familyEvidence.map((item) => item.id), [FACT_EVIDENCE_ID]);
    if (perspectiveId !== "mother") {
      assert.equal(JSON.stringify(projected).includes(PRIVATE_EXPRESSION), false);
      assert.equal(JSON.stringify(projected).includes(PRIVATE_REQUEST), false);
    }
  }

  const replay = acceptFixtureHandover(acceptedState, acceptanceCommand);
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
  assert.strictEqual(replay.nextState, acceptedState);

  const keyConflict = acceptFixtureHandover(acceptedState, {
    ...acceptanceCommand,
    expectedHandoverVersion: 4,
  });
  assert.equal(keyConflict.ok, false);
  assert.equal(keyConflict.code, ACCEPT_HANDOVER_FAILURE.IDEMPOTENCY);
  assert.strictEqual(keyConflict.nextState, acceptedState);
});

test("keeps ownership unchanged on decline and expiry branches", () => {
  const pendingDecline = submitAndCompleteProposal(createGoldenResponsibilityFixture());
  const declined = declineFixtureHandover(pendingDecline, {
    handoverId: HANDOVER_ID,
    actorId: "father",
    expectedVersion: 3,
  });
  assert.equal(declined.ok, true);
  assert.equal(declined.handover.status, "declined");
  assert.equal(findById(declined.nextState.domains, DOMAIN_ID).accountableOwnerId, "mother");

  const pendingExpiry = submitAndCompleteProposal(
    createGoldenResponsibilityFixture(),
    "2030-04-12T00:00:00.000Z",
  );
  const expired = expireFixtureHandover(pendingExpiry, {
    handoverId: HANDOVER_ID,
    now: "2030-04-13T00:00:00.000Z",
    expectedVersion: 3,
  });
  assert.equal(expired.ok, true);
  assert.equal(expired.handover.status, "expired");
  assert.equal(findById(expired.nextState.domains, DOMAIN_ID).accountableOwnerId, "mother");
});

test("completes a todo and stops only its pending reminder through fixture reducers", () => {
  const fixture = createGoldenResponsibilityFixture();
  const derived = deriveFixtureReminders(fixture);
  assert.equal(derived.ok, true);

  const completed = completeFixtureTodo(derived.nextState, {
    todoId: DOMAIN_TODO_ID,
    expectedVersion: 1,
    actorId: "mother",
    familyId: "family-willow",
  });
  assert.equal(completed.ok, true);
  assert.equal(findById(completed.nextState.todos, DOMAIN_TODO_ID).status, "completed");
  assert.equal(findById(completed.nextState.todos, DOMAIN_TODO_ID).version, 2);
  assert.equal(
    completed.nextState.reminders.find((item) => item.sourceId === DOMAIN_TODO_ID).status,
    "cancelled",
  );
  assert.equal(
    completed.nextState.reminders.filter((item) => item.sourceId !== DOMAIN_TODO_ID).every((item) => item.status === "pending"),
    true,
  );

  const stale = completeFixtureTodo(completed.nextState, {
    todoId: DOMAIN_TODO_ID,
    expectedVersion: 1,
    actorId: "mother",
    familyId: "family-willow",
  });
  assert.equal(stale.ok, false);
  assert.strictEqual(stale.nextState, completed.nextState);
});
