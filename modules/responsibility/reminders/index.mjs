const PENDING = 'pending';
const CANCELLED = 'cancelled';
const COMPLETED = 'completed';
const OPEN = 'open';
// FamilyEvent is unversioned in the frozen contract, so its reminder lineage starts at 1.
const FAMILY_EVENT_SOURCE_VERSION = 1;
const PENDING_HANDOVER_STATUSES = new Set(['pending_info', 'pending_ack']);
const PLAN_STATUSES = new Set([PENDING, CANCELLED, COMPLETED]);
const ROUTING_BASIS_BY_SOURCE_TYPE = Object.freeze({
  event: 'event_participant',
  todo: 'todo_assignee',
  domain_review: 'domain_owner',
  handover: 'handover_confirmer',
});
const REMINDER_PLAN_KEYS = Object.freeze([
  'id',
  'sourceType',
  'sourceId',
  'sourceVersion',
  'routingBasis',
  'recipientId',
  'status',
]);

const error = (code) => ({ ok: false, error: { code, message: 'Reminder operation could not be completed.' } });
const success = (value) => ({ ok: true, value });
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPositiveVersion = (value) => Number.isSafeInteger(value) && value > 0;
const isOptionalTimestamp = (value) => value === null || isNonEmptyString(value);
const hasFields = (value, fields) => value !== null && typeof value === 'object' && fields.every((field) => isNonEmptyString(value[field]));
const hasExactKeys = (value, keys) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const ownKeys = Object.keys(value);
  return ownKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

const planId = (sourceType, sourceId, recipientId, sourceVersion) => `${sourceType}:${sourceId}:${recipientId}:${sourceVersion}`;
const createPlan = ({ sourceType, sourceId, sourceVersion, recipientId }) => ({
  id: planId(sourceType, sourceId, recipientId, sourceVersion),
  sourceType,
  sourceId,
  sourceVersion,
  routingBasis: ROUTING_BASIS_BY_SOURCE_TYPE[sourceType],
  recipientId,
  status: PENDING,
});
const sortPlans = (plans) => [...plans].sort((left, right) => left.id.localeCompare(right.id));
const findDomain = (domains, domainId) => domains.find((domain) => domain.id === domainId);
const isValidTodo = (todo) => hasFields(todo, ['id', 'familyId', 'assigneeId'])
  && isNonEmptyString(todo.status) && isNonEmptyString(todo.assignmentBasis) && isPositiveVersion(todo.version)
  && (todo.domainId === null || isNonEmptyString(todo.domainId)) && isOptionalTimestamp(todo.dueAt)
  && !Object.hasOwn(todo, 'sourceVersion') && !Object.hasOwn(todo, 'assignmentType');
const isFutureOrUnscheduled = (dueAt, now) => dueAt === null || Date.parse(dueAt) > Date.parse(now);
const isValidPlan = (plan) => hasExactKeys(plan, REMINDER_PLAN_KEYS)
  && isNonEmptyString(plan.id)
  && Object.hasOwn(ROUTING_BASIS_BY_SOURCE_TYPE, plan.sourceType)
  && isNonEmptyString(plan.sourceId)
  && isPositiveVersion(plan.sourceVersion)
  && plan.routingBasis === ROUTING_BASIS_BY_SOURCE_TYPE[plan.sourceType]
  && isNonEmptyString(plan.recipientId)
  && PLAN_STATUSES.has(plan.status);
const validPlanList = (plans) => Array.isArray(plans) && plans.every(isValidPlan);
const cancelPendingTodoPlans = (plans, todoId) => plans.map((plan) => (
  plan.sourceType === 'todo' && plan.sourceId === todoId && plan.status === PENDING
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
      || !event.participantIds.every(isNonEmptyString) || !isNonEmptyString(event.startsAt)
      || Object.hasOwn(event, 'version') || Object.hasOwn(event, 'sourceVersion')) return error('INVALID_EVENT');
    for (const recipientId of event.participantIds) plans.push(createPlan({
      sourceType: 'event', sourceId: event.id, sourceVersion: FAMILY_EVENT_SOURCE_VERSION, recipientId,
    }));
  }
  for (const todo of todos) {
    if (!isValidTodo(todo)) return error('INVALID_TODO');
    if (todo.status === OPEN) plans.push(createPlan({
      sourceType: 'todo', sourceId: todo.id, sourceVersion: todo.version, recipientId: todo.assigneeId,
    }));
  }
  for (const review of domainReviews) {
    if (!hasFields(review, ['id', 'familyId', 'domainId']) || !isPositiveVersion(review.version) || !isOptionalTimestamp(review.scheduledAt)) return error('INVALID_DOMAIN_REVIEW');
    const domain = findDomain(domains, review.domainId);
    if (!hasFields(domain, ['id', 'familyId', 'accountableOwnerId']) || !isPositiveVersion(domain.version) || domain.familyId !== review.familyId) return error('INVALID_DOMAIN_REVIEW');
    plans.push(createPlan({
      sourceType: 'domain_review', sourceId: review.id, sourceVersion: review.version, recipientId: domain.accountableOwnerId,
    }));
  }
  for (const handover of handovers) {
    if (!hasFields(handover, ['id', 'familyId']) || !isNonEmptyString(handover.status) || !isPositiveVersion(handover.version)
      || !isOptionalTimestamp(handover.expiresAt) || (handover.confirmationRequiredFromId !== null && !isNonEmptyString(handover.confirmationRequiredFromId))) return error('INVALID_HANDOVER');
    if (PENDING_HANDOVER_STATUSES.has(handover.status) && handover.confirmationRequiredFromId !== null) {
      plans.push(createPlan({
        sourceType: 'handover', sourceId: handover.id, sourceVersion: handover.version,
        recipientId: handover.confirmationRequiredFromId,
      }));
    }
  }
  const uniquePlans = new Map();
  for (const plan of plans) uniquePlans.set(plan.id, plan);
  return success(sortPlans(uniquePlans.values()));
}

/** Completes an open Todo and cancels only its pending reminder plans. */
export function completeTodo(todo, reminderPlans, expectedVersion) {
  if (!isValidTodo(todo) || todo.status !== OPEN) return error('INVALID_TODO');
  if (!validPlanList(reminderPlans)) return error('INVALID_REMINDER_PLANS');
  if (expectedVersion !== todo.version) return error('STALE_SOURCE_VERSION');
  return success({
    todo: { ...todo, status: COMPLETED, version: todo.version + 1 },
    reminderPlans: cancelPendingTodoPlans(reminderPlans, todo.id),
  });
}

/** Reroutes one accepted domain migration; explicit, past, and other-domain Todos do not migrate. */
export function rerouteMigratedOpenDomainOwnerTodo(todo, reminderPlans, newOwnerId, expectedVersion, migratedDomainId, now) {
  if (!isValidTodo(todo) || !isNonEmptyString(newOwnerId)
    || !isNonEmptyString(migratedDomainId) || !isNonEmptyString(now)) return error('INVALID_TODO');
  if (!validPlanList(reminderPlans)) return error('INVALID_REMINDER_PLANS');
  if (expectedVersion !== todo.version) return error('STALE_SOURCE_VERSION');
  if (todo.status !== OPEN || todo.assignmentBasis !== 'domain_owner' || todo.domainId !== migratedDomainId || !isFutureOrUnscheduled(todo.dueAt, now)) return error('TODO_NOT_MIGRATABLE');
  const migratedTodo = { ...todo, assigneeId: newOwnerId, version: todo.version + 1 };
  const plansById = new Map(cancelPendingTodoPlans(reminderPlans, todo.id).map((plan) => [plan.id, plan]));
  const replacement = createPlan({
    sourceType: 'todo', sourceId: migratedTodo.id, sourceVersion: migratedTodo.version, recipientId: newOwnerId,
  });
  plansById.set(replacement.id, replacement);
  return success({ todo: migratedTodo, reminderPlans: sortPlans(plansById.values()) });
}
