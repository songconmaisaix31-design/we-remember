import assert from 'node:assert/strict';
import test from 'node:test';

import { completeTodo, deriveReminderPlans, rerouteMigratedOpenDomainOwnerTodo } from './index.mjs';

const planKeys = ['id', 'sourceType', 'sourceId', 'sourceVersion', 'routingBasis', 'recipientId', 'status'];
const todo = {
  id: 'todo-1', familyId: 'family-1', title: 'Follow up', domainId: 'care', assigneeId: 'mother',
  assignmentBasis: 'domain_owner', dueAt: '2026-09-01T09:00:00.000Z', status: 'open', version: 4,
};
const pendingTodoPlan = {
  id: 'todo:todo-1:mother:4', sourceType: 'todo', sourceId: 'todo-1', sourceVersion: 4,
  routingBasis: 'todo_assignee', recipientId: 'mother', status: 'pending',
};
const familyEvent = {
  id: 'event-1', familyId: 'family-1', title: 'Checkup', startsAt: '2026-09-02T09:00:00.000Z',
  participantIds: ['mother', 'father'], supportMemberIds: ['grandmother'], informedMemberIds: ['daughter'], domainId: 'care',
};
const handover = (overrides = {}) => ({
  id: 'handover-1', familyId: 'family-1', domainId: 'care', fromOwnerId: 'mother', proposedOwnerId: 'father',
  status: 'pending_ack', missingFields: [], confirmationRequiredFromId: 'father', acknowledgements: [],
  expectedDomainVersion: 2, expiresAt: null, version: 2, ...overrides,
});
const assertExactPlan = (plan) => {
  assert.deepEqual(Object.keys(plan), planKeys);
  assert.ok(['event', 'todo', 'domain_review', 'handover'].includes(plan.sourceType));
  assert.ok(['event_participant', 'todo_assignee', 'domain_owner', 'handover_confirmer'].includes(plan.routingBasis));
  assert.ok(['pending', 'cancelled', 'completed'].includes(plan.status));
};

test('derives exact contract plans from semantic recipients only', () => {
  const result = deriveReminderPlans({
    events: [familyEvent],
    todos: [todo],
    domains: [{ id: 'care', familyId: 'family-1', accountableOwnerId: 'father', version: 2 }],
    domainReviews: [{ id: 'review-1', familyId: 'family-1', domainId: 'care', scheduledAt: null, version: 3 }],
    handovers: [handover()],
  });
  assert.equal(result.ok, true);
  result.value.forEach(assertExactPlan);
  assert.deepEqual(result.value.map(({ sourceType, recipientId, status, routingBasis }) => [sourceType, recipientId, status, routingBasis]), [
    ['domain_review', 'father', 'pending', 'domain_owner'],
    ['event', 'father', 'pending', 'event_participant'],
    ['event', 'mother', 'pending', 'event_participant'],
    ['handover', 'father', 'pending', 'handover_confirmer'],
    ['todo', 'mother', 'pending', 'todo_assignee'],
  ]);
});

test('FamilyEvent always derives version 1 and rejects non-contract version fields', () => {
  const input = { events: [{ ...familyEvent, participantIds: ['mother', 'mother'] }] };
  const before = structuredClone(input);
  const result = deriveReminderPlans(input);
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].sourceVersion, 1);
  assertExactPlan(result.value[0]);
  assert.deepEqual(input, before);
  assert.equal(deriveReminderPlans({ events: [{ ...familyEvent, version: 2 }] }).error.code, 'INVALID_EVENT');
  assert.equal(deriveReminderPlans({ events: [{ ...familyEvent, sourceVersion: 2 }] }).error.code, 'INVALID_EVENT');
});

test('a pending handover creates a plan only for a non-null current confirmer', () => {
  const result = deriveReminderPlans({
    handovers: [
      handover({ id: 'handover-info', status: 'pending_info', missingFields: ['details'], confirmationRequiredFromId: null }),
      handover({ id: 'handover-ack-unassigned', confirmationRequiredFromId: null }),
      handover({ id: 'handover-ack' }),
      handover({ id: 'handover-accepted', status: 'accepted' }),
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 1);
  assert.deepEqual(result.value[0], {
    id: 'handover:handover-ack:father:2',
    sourceType: 'handover',
    sourceId: 'handover-ack',
    sourceVersion: 2,
    routingBasis: 'handover_confirmer',
    recipientId: 'father',
    status: 'pending',
  });
  assertExactPlan(result.value[0]);
});

test('versioned sources and reminder inputs reject nonpositive versions and Todo aliases', () => {
  const invalidDerivations = [
    { todos: [{ ...todo, version: 0 }] },
    { todos: [{ ...todo, version: -1 }] },
    { todos: [{ ...todo, sourceVersion: 4 }] },
    { todos: [{ ...todo, assignmentType: 'domain_owner' }] },
    { domainReviews: [{ id: 'review-1', familyId: 'family-1', domainId: 'care', scheduledAt: null, version: 0 }] },
    {
      domainReviews: [{ id: 'review-1', familyId: 'family-1', domainId: 'care', scheduledAt: null, version: 1 }],
      domains: [{ id: 'care', familyId: 'family-1', accountableOwnerId: 'father', version: 0 }],
    },
    { handovers: [handover({ version: 0 })] },
    { handovers: [handover({ version: -1 })] },
  ];
  for (const sources of invalidDerivations) assert.equal(deriveReminderPlans(sources).ok, false);

  const invalidPlan = { ...pendingTodoPlan, sourceVersion: 0 };
  assert.equal(completeTodo(todo, [invalidPlan], todo.version).error.code, 'INVALID_REMINDER_PLANS');
  assert.equal(completeTodo(todo, [{ ...pendingTodoPlan, unexpected: true }], todo.version).error.code, 'INVALID_REMINDER_PLANS');
});

test('reminder sources reject impossible calendar values', () => {
  const invalid = '2030-02-30T09:00:00Z';
  assert.equal(deriveReminderPlans({ events: [{ ...familyEvent, startsAt: invalid }] }).error.code, 'INVALID_EVENT');
  assert.equal(deriveReminderPlans({ todos: [{ ...todo, dueAt: invalid }] }).error.code, 'INVALID_TODO');
  assert.equal(deriveReminderPlans({
    domainReviews: [{ id: 'review-1', familyId: 'family-1', domainId: 'care', scheduledAt: invalid, version: 1 }],
    domains: [{ id: 'care', familyId: 'family-1', accountableOwnerId: 'father', version: 1 }],
  }).error.code, 'INVALID_DOMAIN_REVIEW');
  assert.equal(deriveReminderPlans({ handovers: [handover({ expiresAt: invalid })] }).error.code, 'INVALID_HANDOVER');
  assert.equal(deriveReminderPlans({ events: [{ ...familyEvent, startsAt: new Date('2026-09-02T09:00:00Z') }] }).error.code, 'INVALID_EVENT');
});

test('completeTodo increments Todo.version and stops matching pending plans immutably', () => {
  const plans = [
    { ...pendingTodoPlan, id: 'opaque-current-plan' },
    { ...pendingTodoPlan, id: 'event-same-source', sourceType: 'event', routingBasis: 'event_participant' },
    { ...pendingTodoPlan, id: 'other-todo', sourceId: 'todo-2' },
    { ...pendingTodoPlan, id: 'already-completed', status: 'completed' },
  ];
  const before = structuredClone({ todo, plans });
  const result = completeTodo(todo, plans, 4);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.todo, { ...todo, status: 'completed', version: 5 });
  assert.deepEqual(result.value.reminderPlans.map((plan) => plan.status), ['cancelled', 'pending', 'pending', 'completed']);
  result.value.reminderPlans.forEach(assertExactPlan);
  assert.deepEqual({ todo, plans }, before);
  assert.equal(completeTodo(todo, plans, 3).error.code, 'STALE_SOURCE_VERSION');
  assert.equal(completeTodo(todo, plans, 0).error.code, 'STALE_SOURCE_VERSION');
  assert.equal(completeTodo({ ...todo, version: 0 }, plans, 0).error.code, 'INVALID_TODO');
});

test('migration reroutes only open future or unscheduled matching domain-owner todos', () => {
  const plans = [
    { ...pendingTodoPlan, id: 'opaque-current-plan' },
    { ...pendingTodoPlan, id: 'event-same-source', sourceType: 'event', routingBasis: 'event_participant' },
  ];
  const before = structuredClone({ todo, plans });
  const future = rerouteMigratedOpenDomainOwnerTodo(todo, plans, 'father', 4, 'care', '2026-08-30T00:00:00.000Z');
  assert.equal(future.ok, true);
  assert.deepEqual(future.value.todo, { ...todo, assigneeId: 'father', version: 5 });
  assert.deepEqual(future.value.reminderPlans.map(({ sourceType, recipientId, sourceVersion, status }) => [sourceType, recipientId, sourceVersion, status]), [
    ['event', 'mother', 4, 'pending'],
    ['todo', 'mother', 4, 'cancelled'],
    ['todo', 'father', 5, 'pending'],
  ]);
  future.value.reminderPlans.forEach(assertExactPlan);
  assert.deepEqual({ todo, plans }, before);
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, assignmentBasis: 'explicit' }, plans, 'father', 4, 'care', '2026-08-30T00:00:00.000Z').error.code, 'TODO_NOT_MIGRATABLE');
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, domainId: 'other' }, plans, 'father', 4, 'care', '2026-08-30T00:00:00.000Z').error.code, 'TODO_NOT_MIGRATABLE');
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, dueAt: '2026-08-29T00:00:00.000Z' }, plans, 'father', 4, 'care', '2026-08-30T00:00:00.000Z').error.code, 'TODO_NOT_MIGRATABLE');
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, dueAt: null }, plans, 'father', 4, 'care', '2026-08-30T00:00:00.000Z').ok, true);
  assert.equal(rerouteMigratedOpenDomainOwnerTodo(todo, plans, 'father', -1, 'care', '2026-08-30T00:00:00.000Z').error.code, 'STALE_SOURCE_VERSION');
  assert.equal(rerouteMigratedOpenDomainOwnerTodo({ ...todo, version: 0 }, plans, 'father', 0, 'care', '2026-08-30T00:00:00.000Z').error.code, 'INVALID_TODO');
});

test('migration rejects invalid now or dueAt and accepts equivalent offset instants', () => {
  const plans = [{ ...pendingTodoPlan }];
  for (const invalidNow of ['2030-02-30T00:00:00Z', '2026-08-30T24:00:00Z', new Date('2026-08-30T00:00:00Z')]) {
    const before = structuredClone({ todo, plans });
    const result = rerouteMigratedOpenDomainOwnerTodo(todo, plans, 'father', 4, 'care', invalidNow);
    assert.equal(result.error.code, 'INVALID_TODO');
    assert.deepEqual({ todo, plans }, before);
  }
  const invalidDue = { ...todo, dueAt: '2030-02-30T09:00:00Z' };
  assert.equal(
    rerouteMigratedOpenDomainOwnerTodo(invalidDue, plans, 'father', 4, 'care', '2026-08-30T00:00:00Z').error.code,
    'INVALID_TODO',
  );
  assert.equal(
    rerouteMigratedOpenDomainOwnerTodo(todo, plans, 'father', 4, 'care', '2026-08-30T08:00:00+08:00').ok,
    true,
  );
});
