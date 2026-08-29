import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completeTodo,
  deriveReminderPlans,
  rerouteMigratedOpenDomainOwnerTodo,
} from './index.mjs';

const activeTodoPlan = {
  id: 'todo:todo-1:mother:4',
  sourceType: 'todo',
  sourceId: 'todo-1',
  recipientId: 'mother',
  sourceVersion: 4,
  status: 'active',
};

test('routes every reminder type only to its semantic recipient', () => {
  const result = deriveReminderPlans({
    events: [{ id: 'event-1', sourceVersion: 1, participantIds: ['mother', 'father'] }],
    todos: [{ id: 'todo-1', sourceVersion: 4, status: 'open', assigneeId: 'mother', informedMemberIds: ['father'], supportMemberIds: ['grandmother'] }],
    domains: [{ id: 'care', sourceVersion: 3, accountableOwnerId: 'father' }],
    domainReviews: [{ id: 'review-1', sourceVersion: 2, domainId: 'care', informedMemberIds: ['mother'] }],
    handovers: [
      { id: 'handover-info', sourceVersion: 1, status: 'pending_info', confirmationRequiredFromId: 'father' },
      { id: 'handover-ack', sourceVersion: 1, status: 'pending_ack', confirmationRequiredFromId: 'mother' },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.map(({ sourceType, recipientId }) => [sourceType, recipientId]), [
    ['domain_review', 'father'],
    ['event', 'father'],
    ['event', 'mother'],
    ['handover', 'mother'],
    ['handover', 'father'],
    ['todo', 'mother'],
  ]);
  assert.ok(result.value.every((plan) => !('defaultRecipientId' in plan) && !('fallbackRecipientId' in plan)));
});

test('excludes informed members, non-open todos, and terminal handovers', () => {
  const result = deriveReminderPlans({
    todos: [
      { id: 'complete', sourceVersion: 1, status: 'completed', assigneeId: 'mother', informedMemberIds: ['father'] },
      { id: 'cancelled', sourceVersion: 1, status: 'cancelled', assigneeId: 'father' },
    ],
    handovers: [
      { id: 'accepted', sourceVersion: 1, status: 'accepted', confirmationRequiredFromId: 'father' },
      { id: 'declined', sourceVersion: 1, status: 'declined', confirmationRequiredFromId: 'mother' },
      { id: 'expired', sourceVersion: 1, status: 'expired', confirmationRequiredFromId: 'grandmother' },
    ],
  });

  assert.deepEqual(result, { ok: true, value: [] });
});

test('deduplicates duplicate recipients deterministically without mutating inputs', () => {
  const input = {
    events: [{ id: 'event-1', sourceVersion: 1, participantIds: ['mother', 'mother'] }],
  };
  const before = structuredClone(input);
  const result = deriveReminderPlans(input);

  assert.equal(result.ok, true);
  assert.equal(result.value.length, 1);
  assert.deepEqual(input, before);
});

test('completing an open todo cancels active plans and rejects stale versions', () => {
  const todo = { id: 'todo-1', sourceVersion: 4, status: 'open', assigneeId: 'mother' };
  const plans = [activeTodoPlan];
  const plansBefore = structuredClone(plans);
  const result = completeTodo(todo, plans, 4);

  assert.equal(result.ok, true);
  assert.equal(result.value.todo.status, 'completed');
  assert.equal(result.value.todo.sourceVersion, 5);
  assert.equal(result.value.reminderPlans[0].status, 'cancelled');
  assert.deepEqual(todo, { id: 'todo-1', sourceVersion: 4, status: 'open', assigneeId: 'mother' });
  assert.deepEqual(plans, plansBefore);
  assert.deepEqual(completeTodo(todo, [activeTodoPlan], 3), {
    ok: false,
    error: { code: 'STALE_SOURCE_VERSION', message: 'Reminder operation could not be completed.' },
  });
});

test('reroutes only an open domain-owner todo and keeps the replacement plan version aligned', () => {
  const todo = {
    id: 'todo-1',
    sourceVersion: 4,
    status: 'open',
    assigneeId: 'mother',
    domainId: 'care',
    assignmentType: 'domain_owner',
  };
  const result = rerouteMigratedOpenDomainOwnerTodo(todo, [activeTodoPlan], 'father', 4);

  assert.equal(result.ok, true);
  assert.equal(result.value.todo.assigneeId, 'father');
  assert.equal(result.value.todo.sourceVersion, 5);
  assert.deepEqual(result.value.reminderPlans.map((plan) => [plan.recipientId, plan.sourceVersion, plan.status]), [
    ['father', 5, 'active'],
    ['mother', 4, 'cancelled'],
  ]);
  assert.deepEqual(rerouteMigratedOpenDomainOwnerTodo({ ...todo, assignmentType: 'explicit' }, [activeTodoPlan], 'father', 4), {
    ok: false,
    error: { code: 'INVALID_TODO', message: 'Reminder operation could not be completed.' },
  });
  assert.deepEqual(rerouteMigratedOpenDomainOwnerTodo(todo, [activeTodoPlan], 'father', 3), {
    ok: false,
    error: { code: 'STALE_SOURCE_VERSION', message: 'Reminder operation could not be completed.' },
  });
});
