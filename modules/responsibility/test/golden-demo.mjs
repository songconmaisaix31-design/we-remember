import assert from "node:assert/strict";

import {
  createGoldenResponsibilityFixture,
  createResponsibilityPorts,
  createResponsibilityService,
  createResponsibilityStore,
  goldenScenarioProvider,
  grantFixtureFamilyConsent,
} from "../index.mjs";

const familyId = "family-willow";
const handoverId = "handover-grandmother-follow-up-to-father";
const domainId = "domain-grandmother-follow-up";
const todoId = "todo-confirm-follow-up-logistics";
const evidenceId = "evidence-grandmother-follow-up-fact";
const mother = Object.freeze({ actorId: "mother", familyId });
const father = Object.freeze({ actorId: "father", familyId });

const consented = grantFixtureFamilyConsent(createGoldenResponsibilityFixture(), {
  evidenceId,
  actorId: "grandmother",
  consent: {
    id: "consent-grandmother-follow-up-fact",
    evidenceId,
    subjectMemberId: "grandmother",
    grantedVisibility: "family",
    status: "granted",
    version: 1,
  },
});
assert.equal(consented.ok, true);

const store = createResponsibilityStore(consented.nextState);
const service = createResponsibilityService({
  store,
  ports: createResponsibilityPorts({ provider: goldenScenarioProvider }),
});

const suggestion = await service.suggest(mother, {
  text: "Private family responsibility message",
});
const submitted = await service.submit(mother, {
  handoverId,
  expectedVersion: 1,
  idempotencyKey: "demo-submit-v1",
});
const revised = await service.revise(mother, {
  handoverId,
  expectedVersion: 2,
  patch: { missingFields: [], expiresAt: "2030-04-20T00:00:00.000Z" },
  idempotencyKey: "demo-revise-v2",
});
const accepted = await service.accept(father, {
  handoverId,
  expectedHandoverVersion: 3,
  expectedDomainVersion: 1,
  now: "2030-04-10T00:00:00.000Z",
  idempotencyKey: "demo-accept-v3",
});
const replay = await service.accept(father, {
  handoverId,
  expectedHandoverVersion: 3,
  expectedDomainVersion: 1,
  now: "2030-04-10T00:00:00.000Z",
  idempotencyKey: "demo-accept-v3",
});
const fatherView = await service.view(father);

for (const result of [submitted, revised, accepted, replay, fatherView]) {
  assert.equal(result.ok, true);
}
assert.equal(suggestion.status, "suggested");

const state = store.readSnapshot();
const domain = state.domains.find((item) => item.id === domainId);
const todo = state.todos.find((item) => item.id === todoId);
const handover = state.handovers.find((item) => item.id === handoverId);
const handoverReminder = state.reminders.find((item) => item.sourceId === handoverId);

console.log(JSON.stringify({
  status: "ok",
  revision: store.currentRevision(),
  suggestionStatus: suggestion.status,
  handoverStatus: handover.status,
  accountableOwnerId: domain.accountableOwnerId,
  domainTodoAssigneeId: todo.assigneeId,
  handoverReminderStatus: handoverReminder.status,
  auditEntries: state.auditLog.length,
  oldOwnerNotices: state.notices.length,
  acceptanceReplayed: replay.replayed,
  fatherPrivateEvidenceCount: fatherView.projection.privateEvidence.length,
  fatherFamilyEvidenceCount: fatherView.projection.familyEvidence.length,
}, null, 2));
