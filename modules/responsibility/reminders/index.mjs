const PENDING = 'pending';
const CANCELLED = 'cancelled';
const COMPLETED = 'completed';
const OPEN = 'open';
const PENDING_HANDOVER_STATUSES = new Set(['pending_info', 'pending_ack']);

const error = (code) => ({ ok: false, error: { code, message: 'Reminder operation could not be completed.' } });
const success = (value) => ({ ok: true, value });
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPositiveVersion = (value) => Number.isSafeInteger(value) && value > 0;
const isOptionalTimestamp = (value) => value === null || isNonEmptyString(value);
const hasFields = (value, fields) => value !== null && typeof value === 'object' && fields.every((field) => isNonEmptyString(value[field]));

// FamilyEvent has no frozen version. Its explicit source-version input otherwise starts at 1.
const eventVersion = (event) => event.sourceVersion ?? 1;
const planId = (familyId, sourceType, sourceId, recipientId, sourceVersion) => `${familyId}:${sourceType}:${sourceId}:${recipientId}:${sourceVersion}`;
const createPlan = ({ familyId, sourceType, sourceId, recipientId, scheduledAt, sourceVersion, routingBasis }) => ({
  id: planId(familyId, sourceType, sourceId, recipientId, sourceVersion),
  familyId,
  sourceType,
  sourceId,
  recipientId,
  scheduledAt,
  status: PENDING,
  sourceVersion,
  routingBasis,
});
const sortPlans = (plans) => [...plans].sort((left, right) => left.id.localeCompare(right.id));
const findDomain = (domains, domainId) => domains.find((domain) => domain.id === domainId);
const isValidTodo = (todo) => hasFields(todo, ['id', 'familyId', 'assigneeId'])
  && isNonEmptyString(todo.status) && isNonEmptyString(todo.assignmentBasis) && isPositiveVersion(todo.version)
  && (todo.domainId === null || isNonEmptyString(todo.domainId)) && isOptionalTimestamp(todo.dueAt);
const isFutureOrUnscheduled = (dueAt, now) => dueAt === null || Date.parse(dueAt) > Date.parse(now);
const validPlanList = (plans) => Array.isArray(plans) && plans.every((plan) => plan !== null && typeof plan === 'object');
const cancelPendingTodoPlans = (plans, familyId, todoId) => plans.map((plan) => (
  plan.sourceType === 'todo' && plan.familyId === familyId && plan.sourceId === todoId && plan.status === PENDING
    ? { ...plan, status: CANCELLED }
    : { ...plan }
));

/** Derives exact immutable ReminderPlan records from responsibility source semantics. */
export function deriveReminderPlans(sources) {
  if (sources === null || typeof sources !== 'object') return error('INVALID_SOURCES');
  const { events = [], todos = [], domainReviews = [], domains = [], handovers = [] } = sources;
  if (![events, todos, domainReviews, domains, handovers].every(Array.isArray)) return error('INVALID_SOURCES');
  const plans = [];

  for (const event of events) {
    if (!hasFields(event, ['id', 'familyId']) || !Array.isArray(event.participantIds)
      || !event.participantIds.every(isNonEmptyString) || !isNonEmptyString(event.startsAt) || !isPositiveVersion(eventVersion(event))) return error('INVALID_EVENT');
    for (const recipientId of event.participantIds) plans.push(createPlan({
      familyId: event.familyId, sourceType: 'event', sourceId: event.id, recipientId, scheduledAt: event.startsAt,
      sourceVersion: eventVersion(event), routingBasis: 'event_participant',
    }));
  }
  for (const todo of todos) {
    if (!isValidTodo(todo)) return error('INVALID_TODO');
    if (todo.status === OPEN) plans.push(createPlan({
      familyId: todo.familyId, sourceType: 'todo', sourceId: todo.id, recipientId: todo.assigneeId, scheduledAt: todo.dueAt,
      sourceVersion: todo.version, routingBasis: 'todo_assignee',
    }));
  }
  for (const review of domainReviews) {
    if (!hasFields(review, ['id', 'familyId', 'domainId']) || !isPositiveVersion(review.version) || !isOptionalTimestamp(review.scheduledAt)) return error('INVALID_DOMAIN_REVIEW');
    const domain = findDomain(domains, review.domainId);
    if (!hasFields(domain, ['id', 'familyId', 'accountableOwnerId']) || !isPositiveVersion(domain.version) || domain.familyId !== review.familyId) return error('INVALID_DOMAIN_REVIEW');
    plans.push(createPlan({
      familyId: review.familyId, sourceType: 'domain_review', sourceId: review.id, recipientId: domain.accountableOwnerId,
      scheduledAt: review.scheduledAt, sourceVersion: review.version, routingBasis: 'domain_owner',
    }));
  }
  for (const handover of handovers) {
    if (!hasFields(handover, ['id', 'familyId']) || !isNonEmptyString(handover.status) || !isPositiveVersion(handover.version)
      || !isOptionalTimestamp(handover.expiresAt) || (handover.confirmationRequiredFromId !== null && !isNonEmptyString(handover.confirmationRequiredFromId))) return error('INVALID_HANDOVER');
    if (PENDING_HANDOVER_STATUSES.has(handover.status)) {
      if (!isNonEmptyString(handover.confirmationRequiredFromId)) return error('INVALID_HANDOVER');
      plans.push(createPlan({
        familyId: handover.familyId, sourceType: 'handover', sourceId: handover.id, recipientId: handover.confirmationRequiredFromId,
        scheduledAt: handover.expiresAt, sourceVersion: handover.version, routingBasis: 'handover_confirmer',
      }));
    }
  }
  const uniquePlans = new Map();
  for (const plan of plans) uniquePlans.set(plan.id, plan);
  return success(sortPlans(uniquePlans.values()));
}

/** Completes an open Todo and cancels only its pending reminder plans. */
export function completeTodo(todo, reminderPlans, expectedVersion) {
  if (!isValidTodo(todo) || todo.status !== OPEN || !validPlanList(reminderPlans)) return error('INVALID_TODO');
  if (expectedVersion !== todo.version) return error('STALE_SOURCE_VERSION');
  return success({
    todo: { ...todo, status: COMPLETED, version: todo.version + 1 },
    reminderPlans: cancelPendingTodoPlans(reminderPlans, todo.familyId, todo.id),
  });
}

/** Reroutes one accepted domain migration; explicit, past, and other-domain Todos do not migrate. */
export function rerouteMigratedOpenDomainOwnerTodo(todo, reminderPlans, newOwnerId, expectedVersion, migratedDomainId, now) {
  if (!isValidTodo(todo) || !validPlanList(reminderPlans) || !isNonEmptyString(newOwnerId)
    || !isNonEmptyString(migratedDomainId) || !isNonEmptyString(now)) return error('INVALID_TODO');
  if (expectedVersion !== todo.version) return error('STALE_SOURCE_VERSION');
  if (todo.status !== OPEN || todo.assignmentBasis !== 'domain_owner' || todo.domainId !== migratedDomainId || !isFutureOrUnscheduled(todo.dueAt, now)) return error('TODO_NOT_MIGRATABLE');
  const migratedTodo = { ...todo, assigneeId: newOwnerId, version: todo.version + 1 };
  const plansById = new Map(cancelPendingTodoPlans(reminderPlans, todo.familyId, todo.id).map((plan) => [plan.id, plan]));
  const replacement = createPlan({
    familyId: migratedTodo.familyId, sourceType: 'todo', sourceId: migratedTodo.id, recipientId: newOwnerId,
    scheduledAt: migratedTodo.dueAt, sourceVersion: migratedTodo.version, routingBasis: 'todo_assignee',
  });
  plansById.set(replacement.id, replacement);
  return success({ todo: migratedTodo, reminderPlans: sortPlans(plansById.values()) });
}
