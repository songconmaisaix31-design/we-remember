import assert from "node:assert/strict";
import test from "node:test";
import { ACCEPT_HANDOVER_FAILURE, acceptHandover } from "./index.mjs";

const now = "2026-08-30T00:00:00.000Z";
const command = Object.freeze({
  actorId: "father",
  handoverId: "handover-1",
  expectedHandoverVersion: 4,
  expectedDomainVersion: 7,
  idempotencyKey: "accept-1",
  now,
});

function state(overrides = {}) {
  return {
    members: [
      { id: "mother", familyId: "family-1", kind: "human" },
      { id: "father", familyId: "family-1", kind: "human" },
      { id: "helper", familyId: "family-1", kind: "human" },
      { id: "agent", familyId: "family-1", kind: "agent" },
    ],
    domains: [{ id: "domain-1", familyId: "family-1", accountableOwnerId: "mother", version: 7 }],
    handovers: [{
      id: "handover-1", familyId: "family-1", domainId: "domain-1", fromOwnerId: "mother",
      proposedOwnerId: "father", status: "pending_ack", missingFields: [],
      confirmationRequiredFromId: "father", expectedDomainVersion: 7, expiresAt: "2026-08-31T00:00:00.000Z", version: 4,
    }],
    todos: [
      { id: "future", familyId: "family-1", domainId: "domain-1", assigneeId: "mother", assignmentBasis: "domain_owner", dueAt: "2026-09-01T00:00:00.000Z", status: "open", version: 1 },
      { id: "unscheduled", familyId: "family-1", domainId: "domain-1", assigneeId: "mother", assignmentBasis: "domain_owner", dueAt: null, status: "open", version: 2 },
      { id: "explicit", familyId: "family-1", domainId: "domain-1", assigneeId: "helper", assignmentBasis: "explicit", dueAt: null, status: "open", version: 3 },
      { id: "completed", familyId: "family-1", domainId: "domain-1", assigneeId: "mother", assignmentBasis: "domain_owner", dueAt: null, status: "completed", version: 4 },
      { id: "cancelled", familyId: "family-1", domainId: "domain-1", assigneeId: "mother", assignmentBasis: "domain_owner", dueAt: null, status: "cancelled", version: 5 },
      { id: "past", familyId: "family-1", domainId: "domain-1", assigneeId: "mother", assignmentBasis: "domain_owner", dueAt: "2026-08-29T00:00:00.000Z", status: "open", version: 6 },
      { id: "other", familyId: "family-1", domainId: "domain-2", assigneeId: "mother", assignmentBasis: "domain_owner", dueAt: null, status: "open", version: 7 },
    ],
    reminders: [
      { id: "r-future", sourceType: "todo", sourceId: "future", sourceVersion: 1, routingBasis: "todo_assignee", recipientId: "mother", status: "pending" },
      { id: "r-unscheduled", sourceType: "todo", sourceId: "unscheduled", sourceVersion: 2, routingBasis: "todo_assignee", recipientId: "mother", status: "pending" },
      { id: "r-explicit", sourceType: "todo", sourceId: "explicit", sourceVersion: 3, routingBasis: "todo_assignee", recipientId: "helper", status: "pending" },
      { id: "r-handover", sourceType: "handover", sourceId: "handover-1", sourceVersion: 4, routingBasis: "handover_confirmer", recipientId: "father", status: "pending" },
      { id: "r-closed", sourceType: "todo", sourceId: "future", sourceVersion: 1, routingBasis: "todo_assignee", recipientId: "mother", status: "completed" },
    ],
    auditLog: [], notices: [], ...overrides,
  };
}

const byId = (items, id) => items.find((item) => item.id === id);

test("accepts atomically and migrates only future or unscheduled domain-owner todo effects", () => {
  const input = state();
  const result = acceptHandover(input, command);
  assert.equal(result.ok, true);
  assert.equal(result.nextState.domains[0].accountableOwnerId, "father");
  assert.equal(result.nextState.domains[0].version, 8);
  assert.equal(result.nextState.handovers[0].status, "accepted");
  assert.equal(result.nextState.handovers[0].confirmationRequiredFromId, null);
  assert.equal(result.nextState.handovers[0].version, 5);
  assert.equal(Object.isFrozen(result.nextState), true);
  assert.equal(Object.isFrozen(result.nextState.todos[0]), true);
  for (const id of ["future", "unscheduled"]) {
    assert.equal(byId(result.nextState.todos, id).assigneeId, "father");
    assert.equal(byId(result.nextState.reminders, `r-${id}`).recipientId, "father");
  }
  for (const id of ["explicit", "completed", "cancelled", "past", "other"]) {
    assert.deepEqual(byId(result.nextState.todos, id), byId(input.todos, id));
  }
  assert.equal(byId(result.nextState.reminders, "r-handover").status, "completed");
  assert.equal(byId(result.nextState.reminders, "r-closed").recipientId, "mother");
});

test("does not mutate input and does not return partial state on a failed check", () => {
  const input = state();
  const before = structuredClone(input);
  const result = acceptHandover(input, { ...command, actorId: "mother" });
  assert.deepEqual(input, before);
  assert.equal(result.ok, false);
  assert.equal("nextState" in result, false);
  assert.equal(result.code, ACCEPT_HANDOVER_FAILURE.PERMISSION);
});

test("rejects an invalid acceptance instant before changing any state", () => {
  for (const { invalidNow, handoverOverrides = {} } of [
    { invalidNow: "not-a-timestamp", handoverOverrides: { expiresAt: null } },
    { invalidNow: "2026-08-30" },
    { invalidNow: "2030-02-30T00:00:00Z" },
    { invalidNow: "2026-08-30T24:00:00Z" },
    { invalidNow: new Date(now) },
  ]) {
    const input = state({ handovers: [{ ...state().handovers[0], ...handoverOverrides }] });
    const before = structuredClone(input);
    const result = acceptHandover(input, { ...command, now: invalidNow });
    assert.deepEqual(result, { ok: false, code: ACCEPT_HANDOVER_FAILURE.INVALID_INPUT });
    assert.equal("nextState" in result, false);
    assert.deepEqual(input, before);
  }
});

test("rejects invalid expiry and migratable dueAt before changing owner", () => {
  const cases = [
    state({ handovers: [{ ...state().handovers[0], expiresAt: "2030-02-30T00:00:00Z" }] }),
    state({ todos: state().todos.map((todo) => todo.id === "future"
      ? { ...todo, dueAt: "2030-02-30T00:00:00Z" }
      : todo) }),
    state({ todos: state().todos.map((todo) => todo.id === "future"
      ? { ...todo, dueAt: new Date("2026-09-01T00:00:00Z") }
      : todo) }),
  ];
  for (const input of cases) {
    const before = structuredClone(input);
    const result = acceptHandover(input, command);
    assert.deepEqual(result, { ok: false, code: ACCEPT_HANDOVER_FAILURE.INVALID_INPUT });
    assert.equal("nextState" in result, false);
    assert.deepEqual(input, before);
  }
});

test("requires exactly one active same-family human proposed owner", () => {
  const originalMembers = state().members;
  const father = originalMembers.find((member) => member.id === "father");
  const cases = [
    [...originalMembers, { ...father }],
    [...originalMembers, { id: "father", familyId: "family-1", kind: "agent" }],
    [...originalMembers, { id: "father", familyId: "family-2", kind: "human" }],
    originalMembers.map((member) => member.id === "father" ? { ...member, status: "inactive" } : member),
  ];
  for (const members of cases) {
    const input = state({ members });
    const before = structuredClone(input);
    const result = acceptHandover(input, command);
    assert.deepEqual(result, { ok: false, code: ACCEPT_HANDOVER_FAILURE.PERMISSION });
    assert.equal("nextState" in result, false);
    assert.deepEqual(input, before);
  }
});

test("accepts one explicitly active human and valid offset instants", () => {
  const input = state({
    members: state().members.map((member) => member.id === "father" ? { ...member, status: "active" } : member),
    handovers: [{ ...state().handovers[0], expiresAt: "2026-08-31T08:00:00+08:00" }],
    todos: state().todos.map((todo) => todo.id === "future"
      ? { ...todo, dueAt: "2026-09-01T08:00:00+08:00" }
      : todo),
  });
  const result = acceptHandover(input, {
    ...command,
    idempotencyKey: "accept-offset",
    now: "2026-08-30T08:00:00+08:00",
  });
  assert.equal(result.ok, true);
  assert.equal(result.nextState.domains[0].accountableOwnerId, "father");
});

test("same idempotency key replays the accepted snapshot and mismatched reuse conflicts", () => {
  const first = acceptHandover(state(), command);
  const replay = acceptHandover(first.nextState, command);
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.nextState, first.nextState);
  const conflict = acceptHandover(first.nextState, { ...command, actorId: "mother" });
  assert.deepEqual(conflict, { ok: false, code: ACCEPT_HANDOVER_FAILURE.IDEMPOTENCY });
  const timeConflict = acceptHandover(first.nextState, { ...command, now: "2026-08-30T00:00:01.000Z" });
  assert.deepEqual(timeConflict, { ok: false, code: ACCEPT_HANDOVER_FAILURE.IDEMPOTENCY });
});

test("reroutes only mapped pending domain-review reminders and preserves their source version", () => {
  const input = state({
    domainReviews: [
      { id: "review-current", familyId: "family-1", domainId: "domain-1", version: 11 },
      { id: "review-other", familyId: "family-1", domainId: "domain-2", version: 3 },
    ],
    reminders: [
      ...state().reminders,
      { id: "r-review-current", sourceType: "domain_review", sourceId: "review-current", sourceVersion: 11, routingBasis: "domain_owner", recipientId: "mother", status: "pending" },
      { id: "r-review-completed", sourceType: "domain_review", sourceId: "review-current", sourceVersion: 10, routingBasis: "domain_owner", recipientId: "mother", status: "completed" },
      { id: "r-review-other", sourceType: "domain_review", sourceId: "review-other", sourceVersion: 3, routingBasis: "domain_owner", recipientId: "mother", status: "pending" },
      { id: "r-review-unmapped", sourceType: "domain_review", sourceId: "review-missing", sourceVersion: 5, routingBasis: "domain_owner", recipientId: "mother", status: "pending" },
    ],
  });
  const before = structuredClone(input);
  const result = acceptHandover(input, command);

  assert.equal(result.ok, true);
  assert.equal(byId(result.nextState.reminders, "r-review-current").recipientId, "father");
  assert.equal(byId(result.nextState.reminders, "r-review-current").sourceVersion, 11);
  for (const id of ["r-review-completed", "r-review-other", "r-review-unmapped"]) {
    assert.equal(byId(result.nextState.reminders, id).recipientId, "mother");
  }
  assert.deepEqual(input, before);
});

test("rejects wrong actor, agent ownership, stale versions, incomplete, expired, and invalid transitions with stable codes", () => {
  assert.equal(acceptHandover(state(), { ...command, actorId: "mother" }).code, ACCEPT_HANDOVER_FAILURE.PERMISSION);
  assert.equal(acceptHandover(state({ handovers: [{ ...state().handovers[0], proposedOwnerId: "agent", confirmationRequiredFromId: "agent" }] }), { ...command, actorId: "agent" }).code, ACCEPT_HANDOVER_FAILURE.PERMISSION);
  assert.equal(acceptHandover(state(), { ...command, expectedDomainVersion: 6 }).code, ACCEPT_HANDOVER_FAILURE.VERSION);
  assert.equal(acceptHandover(state({ handovers: [{ ...state().handovers[0], missingFields: ["scope"] }] }), command).code, ACCEPT_HANDOVER_FAILURE.INCOMPLETE);
  assert.equal(acceptHandover(state({ handovers: [{ ...state().handovers[0], expiresAt: now }] }), command).code, ACCEPT_HANDOVER_FAILURE.EXPIRED);
  assert.equal(acceptHandover(state({ handovers: [{ ...state().handovers[0], status: "declined" }] }), command).code, ACCEPT_HANDOVER_FAILURE.INVALID_TRANSITION);
});

test("appends one safe audit entry and one informational old-owner notice", () => {
  const result = acceptHandover(state(), command);
  assert.equal(result.nextState.auditLog.length, 1);
  assert.deepEqual(Object.keys(result.nextState.auditLog[0].metadata).sort(), [
    "domainId", "domainVersion", "fromOwnerId", "handoverId", "handoverVersion", "previousDomainVersion", "proposedOwnerId", "status",
  ]);
  assert.equal(result.nextState.auditLog[0].metadata.title, undefined);
  assert.deepEqual(result.nextState.notices, [{
    id: "notice:handover-1:5", familyId: "family-1", recipientId: "mother", type: "handover_accepted",
    handoverId: "handover-1", domainId: "domain-1", createdAt: now,
  }]);
});
