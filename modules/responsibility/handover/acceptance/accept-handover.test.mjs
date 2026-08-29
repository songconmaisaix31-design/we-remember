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

test("same idempotency key replays the accepted snapshot and mismatched reuse conflicts", () => {
  const first = acceptHandover(state(), command);
  const replay = acceptHandover(first.nextState, command);
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.nextState, first.nextState);
  const conflict = acceptHandover(first.nextState, { ...command, actorId: "mother" });
  assert.deepEqual(conflict, { ok: false, code: ACCEPT_HANDOVER_FAILURE.IDEMPOTENCY });
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
