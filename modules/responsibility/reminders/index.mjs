const ACTIVE = 'active';
const CANCELLED = 'cancelled';
const OPEN = 'open';
const PENDING_HANDOVER_STATUSES = new Set(['pending_info', 'pending_ack']);

const error = (code) => ({
  ok: false,
  error: {
    code,
    message: 'Reminder operation could not be completed.',
  },
});

const success = (value) => ({ ok: true, value });

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

const isVersion = (value) => Number.isSafeInteger(value) && value >= 0;

const sourceVersionOf = (source) => source.sourceVersion ?? source.version;

const reminderPlanId = (sourceType, sourceId, recipientId, sourceVersion) =>
  `${sourceType}:${sourceId}:${recipientId}:${sourceVersion}`;

const createPlan = ({ sourceType, sourceId, recipientId, sourceVersion }) => ({
  id: reminderPlanId(sourceType, sourceId, recipientId, sourceVersion),
  sourceType,
  sourceId,
  recipientId,
  sourceVersion,
  status: ACTIVE,
});

const validateSource = (source, fields) =>
  source !== null
  && typeof source === 'object'
  && fields.every((field) => isNonEmptyString(source[field]))
  && isVersion(sourceVersionOf(source));

const findDomain = (domains, domainId) => domains.find((domain) => domain.id === domainId);

/**
 * Derives active reminder plans exclusively from responsibility source records.
 * Inputs are never mutated and plans intentionally have no fallback recipient.
 *
 * @param {{events?: object[], todos?: object[], domainReviews?: object[], domains?: object[], handovers?: object[]}} sources
 * @returns {{ok: true, value: object[]} | {ok: false, error: {code: string, message: string}}}
 */
export function deriveReminderPlans(sources) {
  if (sources === null || typeof sources !== 'object') return error('INVALID_SOURCES');

  const {
    events = [],
    todos = [],
    domainReviews = [],
    domains = [],
    handovers = [],
  } = sources;
  if (![events, todos, domainReviews, domains, handovers].every(Array.isArray)) {
    return error('INVALID_SOURCES');
  }

  const plans = [];

  for (const event of events) {
    if (!validateSource(event, ['id']) || !Array.isArray(event.participantIds)
      || !event.participantIds.every(isNonEmptyString)) return error('INVALID_EVENT');
    for (const participantId of event.participantIds) {
      plans.push(createPlan({
        sourceType: 'event',
        sourceId: event.id,
        recipientId: participantId,
        sourceVersion: sourceVersionOf(event),
      }));
    }
  }

  for (const todo of todos) {
    if (!validateSource(todo, ['id', 'assigneeId']) || typeof todo.status !== 'string') {
      return error('INVALID_TODO');
    }
    if (todo.status === OPEN) {
      plans.push(createPlan({
        sourceType: 'todo',
        sourceId: todo.id,
        recipientId: todo.assigneeId,
        sourceVersion: sourceVersionOf(todo),
      }));
    }
  }

  for (const review of domainReviews) {
    if (!validateSource(review, ['id', 'domainId'])) return error('INVALID_DOMAIN_REVIEW');
    const domain = findDomain(domains, review.domainId);
    if (!validateSource(domain, ['id', 'accountableOwnerId'])) return error('INVALID_DOMAIN_REVIEW');
    plans.push(createPlan({
      sourceType: 'domain_review',
      sourceId: review.id,
      recipientId: domain.accountableOwnerId,
      sourceVersion: sourceVersionOf(review),
    }));
  }

  for (const handover of handovers) {
    if (!validateSource(handover, ['id', 'confirmationRequiredFromId'])
      || typeof handover.status !== 'string') return error('INVALID_HANDOVER');
    if (PENDING_HANDOVER_STATUSES.has(handover.status)) {
      plans.push(createPlan({
        sourceType: 'handover',
        sourceId: handover.id,
        recipientId: handover.confirmationRequiredFromId,
        sourceVersion: sourceVersionOf(handover),
      }));
    }
  }

  const uniquePlans = new Map();
  for (const plan of plans) uniquePlans.set(plan.id, plan);
  return success([...uniquePlans.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

const cancelPlansForTodo = (plans, todoId) => plans.map((plan) => (
  plan.sourceType === 'todo' && plan.sourceId === todoId && plan.status === ACTIVE
    ? { ...plan, status: CANCELLED }
    : { ...plan }
));

/**
 * Marks an open todo completed and cancels its active reminder plans.
 * The expected version prevents a stale caller from cancelling newer plans.
 */
export function completeTodo(todo, reminderPlans, expectedSourceVersion) {
  if (!validateSource(todo, ['id', 'assigneeId']) || todo.status !== OPEN || !Array.isArray(reminderPlans)) {
    return error('INVALID_TODO');
  }
  const currentVersion = sourceVersionOf(todo);
  if (expectedSourceVersion !== undefined && expectedSourceVersion !== currentVersion) {
    return error('STALE_SOURCE_VERSION');
  }
  if (!reminderPlans.every((plan) => plan && typeof plan === 'object')) return error('INVALID_REMINDER_PLANS');

  return success({
    todo: { ...todo, status: 'completed', sourceVersion: currentVersion + 1 },
    reminderPlans: cancelPlansForTodo(reminderPlans, todo.id),
  });
}

/**
 * Moves an open domain-owner todo to a new owner and replaces its active plan.
 * Explicit collaborator todos are intentionally excluded from this command.
 */
export function rerouteMigratedOpenDomainOwnerTodo(todo, reminderPlans, newOwnerId, expectedSourceVersion) {
  if (!validateSource(todo, ['id', 'assigneeId', 'domainId']) || todo.status !== OPEN
    || todo.assignmentType !== 'domain_owner' || !Array.isArray(reminderPlans) || !isNonEmptyString(newOwnerId)) {
    return error('INVALID_TODO');
  }
  const currentVersion = sourceVersionOf(todo);
  if (expectedSourceVersion !== undefined && expectedSourceVersion !== currentVersion) {
    return error('STALE_SOURCE_VERSION');
  }
  if (!reminderPlans.every((plan) => plan && typeof plan === 'object')) return error('INVALID_REMINDER_PLANS');

  const migratedTodo = {
    ...todo,
    assigneeId: newOwnerId,
    sourceVersion: currentVersion + 1,
  };
  const cancelledPlans = cancelPlansForTodo(reminderPlans, todo.id);
  const nextPlan = createPlan({
    sourceType: 'todo',
    sourceId: migratedTodo.id,
    recipientId: newOwnerId,
    sourceVersion: migratedTodo.sourceVersion,
  });
  const plansById = new Map(cancelledPlans.map((plan) => [plan.id, plan]));
  plansById.set(nextPlan.id, nextPlan);

  return success({
    todo: migratedTodo,
    reminderPlans: [...plansById.values()].sort((left, right) => left.id.localeCompare(right.id)),
  });
}
