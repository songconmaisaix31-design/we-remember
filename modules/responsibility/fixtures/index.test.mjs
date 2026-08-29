import assert from "node:assert/strict";
import test from "node:test";

import {
  createFatherPerspectiveFacts,
  createGoldenResponsibilityFixture,
  createGrandmotherPerspectiveFacts,
  createMotherPerspectiveFacts,
} from "./index.mjs";

const sortedKeys = (value) => Object.keys(value).sort();

const EXPECTED_KEYS = Object.freeze({
  state: [
    "auditLog",
    "consents",
    "domains",
    "events",
    "evidence",
    "familyId",
    "handovers",
    "idempotency",
    "members",
    "notices",
    "reminders",
    "todos",
  ],
  member: ["displayName", "familyId", "id", "kind", "version"],
  domain: [
    "accountableOwnerId",
    "evidenceIds",
    "familyId",
    "id",
    "nextActionId",
    "scopeExcluded",
    "scopeIncluded",
    "status",
    "title",
    "version",
    "visibility",
  ],
  event: [
    "domainId",
    "familyId",
    "id",
    "informedMemberIds",
    "participantIds",
    "startsAt",
    "supportMemberIds",
    "title",
  ],
  todo: [
    "assigneeId",
    "assignmentBasis",
    "domainId",
    "dueAt",
    "familyId",
    "id",
    "status",
    "title",
    "version",
  ],
  handover: [
    "acknowledgements",
    "confirmationRequiredFromId",
    "domainId",
    "expectedDomainVersion",
    "expiresAt",
    "familyId",
    "fromOwnerId",
    "id",
    "missingFields",
    "proposedOwnerId",
    "status",
    "version",
  ],
  evidence: [
    "content",
    "createdByMemberId",
    "familyId",
    "id",
    "kind",
    "subjectMemberId",
    "version",
    "visibility",
  ],
  reminder: [
    "id",
    "recipientId",
    "routingBasis",
    "sourceId",
    "sourceType",
    "sourceVersion",
    "status",
  ],
  perspective: [
    "accountableOwnerId",
    "authorizesActions",
    "domainId",
    "domainTodoAssigneeId",
    "familyEvidenceIds",
    "handoverStatus",
    "perspectiveMemberId",
    "privateEvidenceIds",
    "proposedOwnerId",
    "reminderRecipientId",
  ],
});

test("factory returns the exact frozen-contract record shapes", () => {
  const fixture = createGoldenResponsibilityFixture();

  assert.deepEqual(sortedKeys(fixture), EXPECTED_KEYS.state);
  assert.equal(fixture.members.length, 4);
  assert.equal(fixture.domains.length, 1);
  assert.equal(fixture.events.length, 1);
  assert.equal(fixture.todos.length, 2);
  assert.equal(fixture.handovers.length, 1);
  assert.equal(fixture.evidence.length, 3);
  assert.equal(fixture.reminders.length, 1);
  assert.deepEqual(
    fixture.members.map(({ id, kind }) => ({ id, kind })),
    [
      { id: "member-mother", kind: "human" },
      { id: "member-father", kind: "human" },
      { id: "member-grandmother", kind: "human" },
      { id: "member-family-agent", kind: "agent" },
    ],
  );
  assert.equal(fixture.members.every((member) => member.familyId === fixture.familyId), true);

  for (const member of fixture.members) {
    assert.deepEqual(sortedKeys(member), EXPECTED_KEYS.member);
  }
  assert.deepEqual(sortedKeys(fixture.domains[0]), EXPECTED_KEYS.domain);
  assert.deepEqual(sortedKeys(fixture.events[0]), EXPECTED_KEYS.event);
  for (const todo of fixture.todos) {
    assert.deepEqual(sortedKeys(todo), EXPECTED_KEYS.todo);
  }
  assert.deepEqual(sortedKeys(fixture.handovers[0]), EXPECTED_KEYS.handover);
  for (const evidence of fixture.evidence) {
    assert.deepEqual(sortedKeys(evidence), EXPECTED_KEYS.evidence);
  }
  assert.deepEqual(sortedKeys(fixture.reminders[0]), EXPECTED_KEYS.reminder);

  const versionedEntities = [
    ...fixture.members,
    ...fixture.domains,
    ...fixture.todos,
    ...fixture.handovers,
    ...fixture.evidence,
  ];
  for (const entity of versionedEntities) {
    assert.equal(Number.isSafeInteger(entity.version) && entity.version > 0, true);
  }
  assert.equal(fixture.handovers[0].expectedDomainVersion > 0, true);
  assert.equal(fixture.reminders[0].sourceVersion > 0, true);
});

test("every factory call returns deterministic but fully isolated data", () => {
  const first = createGoldenResponsibilityFixture();
  const second = createGoldenResponsibilityFixture();

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.members, second.members);
  assert.notEqual(first.members[0], second.members[0]);
  assert.notEqual(first.domains[0].scopeIncluded, second.domains[0].scopeIncluded);
  assert.notEqual(first.handovers[0].missingFields, second.handovers[0].missingFields);

  first.members[0].displayName = "Changed locally";
  first.domains[0].scopeIncluded.push("Changed locally");
  first.evidence[0].content = "Changed locally";
  first.reminders.length = 0;
  assert.deepEqual(createGoldenResponsibilityFixture(), second);

  const mother = createMotherPerspectiveFacts();
  const nextMother = createMotherPerspectiveFacts();
  assert.deepEqual(mother, nextMother);
  assert.notEqual(mother, nextMother);
  assert.notEqual(mother.privateEvidenceIds, nextMother.privateEvidenceIds);
  mother.privateEvidenceIds.length = 0;
  assert.notEqual(nextMother.privateEvidenceIds.length, 0);
});

test("initial owner, future domain todo, reminder, and draft handover are aligned", () => {
  const fixture = createGoldenResponsibilityFixture();
  const domain = fixture.domains[0];
  const domainOwner = fixture.members.find((member) => member.id === domain.accountableOwnerId);
  const domainTodo = fixture.todos.find((todo) => todo.assignmentBasis === "domain_owner");
  const explicitTodo = fixture.todos.find((todo) => todo.assignmentBasis === "explicit");
  const reminder = fixture.reminders[0];
  const handover = fixture.handovers[0];

  assert.equal(domainOwner.kind, "human");
  assert.equal(fixture.events[0].domainId, domain.id);
  assert.deepEqual(fixture.events[0].participantIds, [
    fixture.members.find((member) => member.displayName === "Mei Chen").id,
  ]);
  assert.equal(domain.nextActionId, domainTodo.id);
  assert.equal(domainTodo.assigneeId, domain.accountableOwnerId);
  assert.equal(domainTodo.status, "open");
  assert.equal(Date.parse(domainTodo.dueAt) > Date.parse("2026-08-30T00:00:00.000Z"), true);
  assert.equal(explicitTodo.assigneeId, fixture.members.find((member) => member.kind === "agent").id);
  assert.equal(fixture.reminders.some((item) => item.sourceId === explicitTodo.id), false);

  assert.deepEqual(reminder, {
    id: "reminder-confirm-follow-up-logistics",
    sourceType: "todo",
    sourceId: domainTodo.id,
    sourceVersion: domainTodo.version,
    routingBasis: "todo_assignee",
    recipientId: domain.accountableOwnerId,
    status: "pending",
  });
  assert.equal(handover.fromOwnerId, domain.accountableOwnerId);
  assert.equal(handover.proposedOwnerId, fixture.members.find((member) => member.displayName === "Ethan Chen").id);
  assert.equal(handover.status, "draft");
  assert.equal(handover.confirmationRequiredFromId, null);
  assert.deepEqual(handover.acknowledgements, []);
  assert.deepEqual(fixture.consents, []);
  assert.deepEqual(fixture.auditLog, []);
  assert.deepEqual(fixture.notices, []);
  assert.deepEqual(fixture.idempotency, []);
});

test("private burden text stays only in private_expression and never enters family expectations", () => {
  const fixture = createGoldenResponsibilityFixture();
  const expression = fixture.evidence.find((item) => item.kind === "private_expression");
  const privateText = expression.content;
  const containingEvidence = fixture.evidence.filter((item) => item.content.includes(privateText));

  assert.deepEqual(containingEvidence.map((item) => item.kind), ["private_expression"]);
  assert.equal(fixture.evidence.every((item) => item.visibility === "private"), true);
  assert.deepEqual(fixture.consents, []);

  const perspectives = [
    createMotherPerspectiveFacts(),
    createFatherPerspectiveFacts(),
    createGrandmotherPerspectiveFacts(),
  ];
  for (const perspective of perspectives) {
    assert.deepEqual(sortedKeys(perspective), EXPECTED_KEYS.perspective);
    assert.equal(perspective.authorizesActions, false);
    assert.deepEqual(perspective.familyEvidenceIds, []);
    assert.equal(JSON.stringify(perspective).includes(privateText), false);
  }

  assert.deepEqual(perspectives[0].privateEvidenceIds, fixture.evidence.map((item) => item.id));
  assert.deepEqual(perspectives[1].privateEvidenceIds, []);
  assert.deepEqual(perspectives[2].privateEvidenceIds, [
    fixture.evidence.find((item) => item.kind === "shareable_fact").id,
  ]);
});
