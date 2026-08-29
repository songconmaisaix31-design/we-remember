import assert from 'node:assert/strict';
import test from 'node:test';

import { completeTodo, deriveReminderPlans, rerouteMigratedOpenDomainOwnerTodo } from './index.mjs';

const planKeys = ['id', 'familyId', 'sourceType', 'sourceId', 'recipientId', 'scheduledAt', 'status', 'sourceVersion', 'routingBasis'];
const todo = {
  id: 'todo-1', familyId: 'family-1', title: 'Follow up', domainId: 'care', assigneeId: 'mother',
  assignmentBasis: 'domain_owner', dueAt: '2026-09-01T09:00:00.000Z', status: 'open', version: 4,
};
const pendingTodoPlan = {
  id: 'family-1:todo:todo-1:mother:4', familyId: 'family-1', sourceType: 'todo', sourceId: 'todo-1',
  recipientId: 'mother', scheduledAt: '2026-09-01T09:00:00.000Z', status: 'pending', sourceVersion: 4,
  routingBasis: 'todo_assignee',
};

test('derives exact contract plans from semantic recipients only', () => {
  const result = deriveReminderPlans({
    events: [{ id: 'event-1', familyId: 'family-1', startsAt: '2026-09-02T09:00:00.000Z', participantIds: ['mother', 'father'], supportMemberIds: ['grandmother'], informedMemberIds: ['daughter'] }],
    todos: [todo],
    domains: [{ id: 'care', familyId: 'family-1', accountableOwnerId: 'father', version: 2 }],
    domainReviews: [{ id: 'review-1', familyId: 'family-1', domainId: 'care', scheduledAt: null, version: 3 }],
    handovers: [{ id: 'handover-1', familyId: 'family-1', status: 'pending_ack', confirmationRequiredFromId: 'father', expiresAt: null, version: 2 }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.map((plan) => Object.keys(plan)), Array(5).fill(planKeys));
  assert.deepEqual(result.value.map(({ sourceType, recipientId, status, routingBasis }) => [sourceType, recipientId, status, routingBasis]), [
    ['domain_review', 'father', 'pending', 'domain_owner'],
    ['event', 'father', 'pending', 'event_participant'],
    ['event', 'mother', 'pending', 'event_participant'],
    ['handover', 'father', 'pending', 'handover_confirmer'],
    ['todo', 'mother', 'pending', 'todo_assignee'],
  ]);
});

test('deduplicates deterministically and rejects zero versions without mutation', () => {
  const input = { events: [{ id: 'event-1', familyId: 'family-1', startsAt: '2026-09-02T09:00:00.000Z', participantIds: ['mother', 'mother'] }] };
  const before = structuredClone(input);
  const result = deriveReminderPlans(input);
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].sourceVersion, 1);
  assert.deepEqual(input, before);
  assert.equal(deriveReminderPlans({ todos: [{ ...todo, version: 0 }] }).error.code, 'INVALID_TODO');
});

test('completeTodo increments Todo.version and stops matching pending plans immutably', () => {
  const plans = [pendingTodoPlan, { ...pendingTodoPlan, id: 'other', sourceId: 'todo-2' }];
  const before = structuredClone({ todo, plans });
  const result = completeTodo(todo, plans, 4);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.todo, { ...todo, status: 'completed', version: 5 });
  assert.deepEqual(result.value.reminderPlans.map((plan) => plan.status), ['cancelled', 'pending']);
  assert.deepEqual({ todo, plans }, before);
  assert.equal(completeTodo(todo, plans, 3).error.code, 'STALE_SOURCE_VERSION');
});

test('migration reroutes only open future or unscheduled matching domain-owner todos', () => {
  const future = rerouteMigratedOpenDomainOwnerTodo(todo, [pendingTodoPlan], 'father', 4, 'care', '2026-08-30T00:00:00.000Z');
  assert.equal(future.ok, true);
  assert.deepEqual(future.value.todo, { ...todo, assigneeId: 'father', version: 5 });
  assert.deepEqual(future.value.reminderPlans.map(({ recipientId, sourceVersion, status }) => [recipientId, sourceVersion, status]), [
    ['father', 5, 'pending'], ['mother', 4, 'cancelled'],
  ]);
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, assignmentBasis: 'explicit' }, [pendingTodoPlan], 'father', 4, 'care', '2026-08-30T00:00:00.000Z').error.code, 'TODO_NOT_MIGRATABLE');
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, domainId: 'other' }, [pendingTodoPlan], 'father', 4, 'care', '2026-08-30T00:00:00.000Z').error.code, 'TODO_NOT_MIGRATABLE');
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, dueAt: '2026-08-29T00:00:00.000Z' }, [pendingTodoPlan], 'father', 4, 'care', '2026-08-30T00:00:00.000Z').error.code, 'TODO_NOT_MIGRATABLE');
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, dueAt: null }, [pendingTodoPlan], 'father', 4, 'care', '2026-08-30T00:00:00.000Z').ok, true);
});
