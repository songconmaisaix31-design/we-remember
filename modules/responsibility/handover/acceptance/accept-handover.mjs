import { isIsoCalendarInstant, parseIsoCalendarInstant } from "../../model/time.mjs";

const FAILURE = Object.freeze({
  INVALID_INPUT: "invalid_input",
  INVALID_TRANSITION: "invalid_transition",
  INCOMPLETE: "incomplete_handover",
  PERMISSION: "permission_denied",
  VERSION: "version_conflict",
  EXPIRED: "handover_expired",
  IDEMPOTENCY: "idempotency_conflict",
});

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const failure = (code) => Object.freeze({ ok: false, code });
const replaceById = (items, id, replacement) => items.map((item) => item.id === id ? replacement : item);

function fingerprint(command) {
  return JSON.stringify({
    actorId: command.actorId,
    handoverId: command.handoverId,
    expectedHandoverVersion: command.expectedHandoverVersion,
    expectedDomainVersion: command.expectedDomainVersion,
    now: command.now,
  });
}

function isFutureOrUnscheduled(dueAt, nowInstant) {
  if (dueAt === null) return true;
  const due = parseIsoCalendarInstant(dueAt);
  return due !== null && due > nowInstant;
}

function resolveActiveHumanMember(members, familyId, memberId) {
  const matches = members.filter((member) => isObject(member) && member.id === memberId);
  if (matches.length !== 1) return null;
  const member = matches[0];
  const active = member.status === undefined || member.status === "active";
  return member.familyId === familyId && member.kind === "human" && active ? member : null;
}

function isMigrationCandidate(todo, domain) {
  return isObject(todo) && todo.familyId === domain.familyId && todo.domainId === domain.id
    && todo.status === "open" && todo.assignmentBasis === "domain_owner";
}

function immutableSnapshot(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableSnapshot));
  if (isObject(value)) {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableSnapshot(item)])));
  }
  return value;
}

/**
 * Atomically accepts a pending handover over one plain-object state snapshot.
 * The returned state is the only place an idempotency result is retained.
 */
export function acceptHandover(state, command) {
  if (!isObject(state) || !isObject(command) || !isNonEmptyString(command.idempotencyKey)
    || !isNonEmptyString(command.actorId) || !isNonEmptyString(command.handoverId)
    || !isIsoCalendarInstant(command.now) || !Number.isInteger(command.expectedHandoverVersion)
    || !Number.isInteger(command.expectedDomainVersion) || !Array.isArray(state.members)
    || !Array.isArray(state.domains) || !Array.isArray(state.handovers) || !Array.isArray(state.todos)
    || !Array.isArray(state.reminders) || !Array.isArray(state.auditLog) || !Array.isArray(state.notices)) {
    return failure(FAILURE.INVALID_INPUT);
  }

  const nowInstant = parseIsoCalendarInstant(command.now);
  const handover = state.handovers.find((item) => item.id === command.handoverId);
  if (!handover) return failure(FAILURE.INVALID_INPUT);
  const domain = state.domains.find((item) => item.id === handover.domainId);
  if (!domain || domain.familyId !== handover.familyId) return failure(FAILURE.INVALID_INPUT);
  if (!resolveActiveHumanMember(state.members, handover.familyId, handover.proposedOwnerId)) {
    return failure(FAILURE.PERMISSION);
  }
  const expiresAt = handover.expiresAt === null ? null : parseIsoCalendarInstant(handover.expiresAt);
  if (handover.expiresAt !== null && expiresAt === null) return failure(FAILURE.INVALID_INPUT);
  const migrationCandidates = state.todos.filter((todo) => isMigrationCandidate(todo, domain));
  if (migrationCandidates.some((todo) => todo.dueAt !== null && !isIsoCalendarInstant(todo.dueAt))) {
    return failure(FAILURE.INVALID_INPUT);
  }

  const keyFingerprint = fingerprint(command);
  const prior = (Array.isArray(state.idempotency) ? state.idempotency : [])
    .find((entry) => entry.key === command.idempotencyKey);
  if (prior) {
    if (prior.fingerprint !== keyFingerprint) return failure(FAILURE.IDEMPOTENCY);
    return Object.freeze({ ok: true, code: "accepted", nextState: state, idempotent: true });
  }

  if (handover.status !== "pending_ack") return failure(FAILURE.INVALID_TRANSITION);
  if (!Array.isArray(handover.missingFields) || handover.missingFields.length !== 0) return failure(FAILURE.INCOMPLETE);
  if (handover.confirmationRequiredFromId !== command.actorId || handover.proposedOwnerId !== command.actorId) {
    return failure(FAILURE.PERMISSION);
  }
  if (domain.accountableOwnerId !== handover.fromOwnerId) return failure(FAILURE.INVALID_TRANSITION);
  if (handover.expectedDomainVersion !== command.expectedDomainVersion || domain.version !== command.expectedDomainVersion
    || handover.version !== command.expectedHandoverVersion) return failure(FAILURE.VERSION);
  if (handover.expiresAt !== null) {
    if (expiresAt <= nowInstant) return failure(FAILURE.EXPIRED);
  }

  const nextDomain = { ...domain, accountableOwnerId: handover.proposedOwnerId, version: domain.version + 1 };
  const nextHandover = {
    ...handover,
    status: "accepted",
    confirmationRequiredFromId: null,
    version: handover.version + 1,
  };
  const migratedTodoIds = new Set();
  const nextTodos = state.todos.map((todo) => {
    const shouldMigrate = isMigrationCandidate(todo, domain) && isFutureOrUnscheduled(todo.dueAt, nowInstant);
    if (!shouldMigrate) return todo;
    migratedTodoIds.add(todo.id);
    return { ...todo, assigneeId: handover.proposedOwnerId, version: todo.version + 1 };
  });
  const todoVersions = new Map(nextTodos.map((todo) => [todo.id, todo.version]));
  const migratedDomainReviewIds = new Set(
    (Array.isArray(state.domainReviews) ? state.domainReviews : [])
      .filter((review) => isObject(review) && isNonEmptyString(review.id)
        && review.familyId === domain.familyId && review.domainId === domain.id)
      .map((review) => review.id),
  );
  const nextReminders = state.reminders.map((reminder) => {
    if (reminder.sourceType === "todo" && reminder.status === "pending" && migratedTodoIds.has(reminder.sourceId)) {
      return { ...reminder, recipientId: handover.proposedOwnerId, sourceVersion: todoVersions.get(reminder.sourceId) };
    }
    if (reminder.sourceType === "handover" && reminder.sourceId === handover.id && reminder.status === "pending") {
      return { ...reminder, status: "completed", sourceVersion: nextHandover.version };
    }
    if (reminder.sourceType === "domain_review" && reminder.routingBasis === "domain_owner"
      && reminder.status === "pending" && migratedDomainReviewIds.has(reminder.sourceId)) {
      return { ...reminder, recipientId: handover.proposedOwnerId };
    }
    return reminder;
  });
  const audit = {
    id: `audit:${handover.id}:${nextHandover.version}`,
    familyId: domain.familyId,
    actorId: command.actorId,
    action: "handover.accepted",
    entityType: "handover",
    entityId: handover.id,
    occurredAt: command.now,
    metadata: {
      handoverId: handover.id,
      domainId: domain.id,
      fromOwnerId: handover.fromOwnerId,
      proposedOwnerId: handover.proposedOwnerId,
      status: nextHandover.status,
      previousDomainVersion: domain.version,
      domainVersion: nextDomain.version,
      handoverVersion: nextHandover.version,
    },
  };
  const notice = {
    id: `notice:${handover.id}:${nextHandover.version}`,
    familyId: domain.familyId,
    recipientId: handover.fromOwnerId,
    type: "handover_accepted",
    handoverId: handover.id,
    domainId: domain.id,
    createdAt: command.now,
  };
  const record = { key: command.idempotencyKey, fingerprint: keyFingerprint, result: "accepted" };
  const nextState = immutableSnapshot({
    ...state,
    domains: replaceById(state.domains, domain.id, nextDomain),
    handovers: replaceById(state.handovers, handover.id, nextHandover),
    todos: nextTodos,
    reminders: nextReminders,
    auditLog: [...state.auditLog, audit],
    notices: [...state.notices, notice],
    idempotency: [...(Array.isArray(state.idempotency) ? state.idempotency : []), record],
  });
  return Object.freeze({ ok: true, code: "accepted", nextState, idempotent: false });
}

export { FAILURE as ACCEPT_HANDOVER_FAILURE };
