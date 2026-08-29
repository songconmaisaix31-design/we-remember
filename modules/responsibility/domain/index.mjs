const DOMAIN_KEYS = Object.freeze([
  "id",
  "familyId",
  "title",
  "accountableOwnerId",
  "status",
  "scopeIncluded",
  "scopeExcluded",
  "nextActionId",
  "visibility",
  "evidenceIds",
  "version",
]);

const EVENT_KEYS = Object.freeze([
  "id",
  "familyId",
  "title",
  "startsAt",
  "participantIds",
  "supportMemberIds",
  "informedMemberIds",
  "domainId",
]);

const TODO_KEYS = Object.freeze([
  "id",
  "familyId",
  "title",
  "domainId",
  "assigneeId",
  "assignmentBasis",
  "dueAt",
  "status",
  "version",
]);

const DOMAIN_STATUSES = new Set(["active", "paused", "completed"]);
const VISIBILITIES = new Set(["private", "family"]);
const TODO_STATUSES = new Set(["open", "completed", "cancelled"]);
const ASSIGNMENT_BASES = new Set(["domain_owner", "explicit"]);
const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 4096;
const MAX_ARRAY_LENGTH = 256;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SAFE_ERROR_MESSAGE = "Responsibility domain command could not be completed.";

export const DOMAIN_COMMAND_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  INVALID_DOMAIN: "invalid_domain",
  INVALID_EVENT: "invalid_event",
  INVALID_TODO: "invalid_todo",
  INVALID_SCOPE: "invalid_scope",
  INVALID_VERSION: "invalid_version",
  VERSION_CONFLICT: "version_conflict",
  FAMILY_MISMATCH: "family_mismatch",
  OWNER_NOT_FOUND: "owner_not_found",
  OWNER_NOT_UNIQUE: "owner_not_unique",
  OWNER_NOT_HUMAN: "owner_not_human",
  ASSIGNEE_NOT_FOUND: "assignee_not_found",
  ASSIGNEE_NOT_UNIQUE: "assignee_not_unique",
  EVENT_OWNER_FIELD_FORBIDDEN: "event_owner_field_forbidden",
  TODO_NOT_OPEN: "todo_not_open",
  TODO_NOT_IN_DOMAIN: "todo_not_in_domain",
  TODO_OWNER_MISMATCH: "todo_owner_mismatch",
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const isId = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
const isText = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT_LENGTH;
const isPositiveVersion = (value) => Number.isSafeInteger(value) && value > 0;
const isNullableId = (value) => value === null || isId(value);
const isTimestamp = (value) => typeof value === "string"
  && ISO_TIMESTAMP.test(value)
  && Number.isFinite(Date.parse(value));
const isNullableTimestamp = (value) => value === null || isTimestamp(value);

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => hasOwn(value, key));
}

function isUniqueArray(value, predicate) {
  return Array.isArray(value)
    && value.length <= MAX_ARRAY_LENGTH
    && value.every(predicate)
    && new Set(value).size === value.length;
}

const isIdArray = (value) => isUniqueArray(value, isId);
const isTextArray = (value) => isUniqueArray(value, isText);

function hasValidDomainFields(domain) {
  return hasExactKeys(domain, DOMAIN_KEYS)
    && isId(domain.id)
    && isId(domain.familyId)
    && isText(domain.title)
    && isId(domain.accountableOwnerId)
    && DOMAIN_STATUSES.has(domain.status)
    && isTextArray(domain.scopeIncluded)
    && isTextArray(domain.scopeExcluded)
    && isNullableId(domain.nextActionId)
    && VISIBILITIES.has(domain.visibility)
    && isIdArray(domain.evidenceIds);
}

function hasValidEventFields(event) {
  return hasExactKeys(event, EVENT_KEYS)
    && isId(event.id)
    && isId(event.familyId)
    && isText(event.title)
    && isTimestamp(event.startsAt)
    && isIdArray(event.participantIds)
    && isIdArray(event.supportMemberIds)
    && isIdArray(event.informedMemberIds)
    && isNullableId(event.domainId);
}

function hasValidTodoFields(todo) {
  return hasExactKeys(todo, TODO_KEYS)
    && isId(todo.id)
    && isId(todo.familyId)
    && isText(todo.title)
    && isNullableId(todo.domainId)
    && isId(todo.assigneeId)
    && ASSIGNMENT_BASES.has(todo.assignmentBasis)
    && isNullableTimestamp(todo.dueAt)
    && TODO_STATUSES.has(todo.status);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function freezeDeep(value) {
  if (Array.isArray(value) || isRecord(value)) {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

const failureResults = freezeDeep(Object.fromEntries(
  Object.values(DOMAIN_COMMAND_ERROR_CODES).map((code) => [
    code,
    { ok: false, error: { code, message: SAFE_ERROR_MESSAGE } },
  ]),
));

const failure = (code) => failureResults[code];
const success = (value) => freezeDeep({ ok: true, value: clone(value) });

function versionError(currentVersion, expectedVersion) {
  if (!isPositiveVersion(currentVersion) || !isPositiveVersion(expectedVersion)) {
    return DOMAIN_COMMAND_ERROR_CODES.INVALID_VERSION;
  }
  return currentVersion === expectedVersion ? null : DOMAIN_COMMAND_ERROR_CODES.VERSION_CONFLICT;
}

function memberError(members, familyId, memberId, role) {
  if (!Array.isArray(members)) return DOMAIN_COMMAND_ERROR_CODES.INVALID_INPUT;
  const matches = members.filter((member) => isRecord(member) && member.id === memberId);
  const missingCode = role === "owner"
    ? DOMAIN_COMMAND_ERROR_CODES.OWNER_NOT_FOUND
    : DOMAIN_COMMAND_ERROR_CODES.ASSIGNEE_NOT_FOUND;
  const duplicateCode = role === "owner"
    ? DOMAIN_COMMAND_ERROR_CODES.OWNER_NOT_UNIQUE
    : DOMAIN_COMMAND_ERROR_CODES.ASSIGNEE_NOT_UNIQUE;

  if (matches.length === 0) return missingCode;
  if (matches.length !== 1) return duplicateCode;
  const member = matches[0];
  if (!isId(member.familyId) || !["human", "agent"].includes(member.kind)) {
    return DOMAIN_COMMAND_ERROR_CODES.INVALID_INPUT;
  }
  if (member.familyId !== familyId) return DOMAIN_COMMAND_ERROR_CODES.FAMILY_MISMATCH;
  return role === "owner" && member.kind !== "human"
    ? DOMAIN_COMMAND_ERROR_CODES.OWNER_NOT_HUMAN
    : null;
}

function domainError(domain, members) {
  if (!hasValidDomainFields(domain)) return DOMAIN_COMMAND_ERROR_CODES.INVALID_DOMAIN;
  if (!isPositiveVersion(domain.version)) return DOMAIN_COMMAND_ERROR_CODES.INVALID_VERSION;
  return memberError(members, domain.familyId, domain.accountableOwnerId, "owner");
}

function todoAssignmentError(todo, domain, members) {
  if (todo.assignmentBasis === "domain_owner") {
    return todo.assigneeId === domain.accountableOwnerId
      ? null
      : DOMAIN_COMMAND_ERROR_CODES.TODO_OWNER_MISMATCH;
  }
  return memberError(members, todo.familyId, todo.assigneeId, "assignee");
}

/**
 * Validates and copies a new domain. The caller supplies identity and version;
 * this layer only admits a single same-family human accountable owner.
 */
export function createResponsibilityDomain(command = {}) {
  if (!isRecord(command)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_INPUT);
  const { domain, members } = command;
  const error = domainError(domain, members);
  return error ? failure(error) : success(domain);
}

/** Updates only the included/excluded scope under optimistic domain versioning. */
export function updateResponsibilityScope(command = {}) {
  if (!isRecord(command)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_INPUT);
  const { domain, members, expectedDomainVersion, scopeIncluded, scopeExcluded } = command;
  const error = domainError(domain, members);
  if (error) return failure(error);
  if (!isTextArray(scopeIncluded) || !isTextArray(scopeExcluded)) {
    return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_SCOPE);
  }
  const version = versionError(domain.version, expectedDomainVersion);
  if (version) return failure(version);

  return success({
    ...domain,
    scopeIncluded: clone(scopeIncluded),
    scopeExcluded: clone(scopeExcluded),
    version: domain.version + 1,
  });
}

/**
 * Links an event by domain ID only. Event ownership remains derived from the
 * domain, so an event-level accountable owner field is rejected rather than copied.
 */
export function linkEventToDomain(command = {}) {
  if (!isRecord(command)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_INPUT);
  const { event, domain, members, expectedDomainVersion } = command;
  const error = domainError(domain, members);
  if (error) return failure(error);
  if (isRecord(event) && hasOwn(event, "accountableOwnerId")) {
    return failure(DOMAIN_COMMAND_ERROR_CODES.EVENT_OWNER_FIELD_FORBIDDEN);
  }
  if (!hasValidEventFields(event)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_EVENT);
  const version = versionError(domain.version, expectedDomainVersion);
  if (version) return failure(version);
  if (event.familyId !== domain.familyId) return failure(DOMAIN_COMMAND_ERROR_CODES.FAMILY_MISMATCH);

  return success({ ...event, domainId: domain.id });
}

/**
 * Links a todo under optimistic versions. Domain-owner todos inherit the
 * current owner; explicit todos keep their supplied same-family human or agent assignee.
 */
export function linkTodoToDomain(command = {}) {
  if (!isRecord(command)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_INPUT);
  const { todo, domain, members, expectedDomainVersion, expectedTodoVersion } = command;
  const error = domainError(domain, members);
  if (error) return failure(error);
  if (!hasValidTodoFields(todo)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_TODO);
  if (!isPositiveVersion(todo.version)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_VERSION);
  const domainVersion = versionError(domain.version, expectedDomainVersion);
  if (domainVersion) return failure(domainVersion);
  const todoVersion = versionError(todo.version, expectedTodoVersion);
  if (todoVersion) return failure(todoVersion);
  if (todo.familyId !== domain.familyId) return failure(DOMAIN_COMMAND_ERROR_CODES.FAMILY_MISMATCH);

  const assigneeId = todo.assignmentBasis === "domain_owner"
    ? domain.accountableOwnerId
    : todo.assigneeId;
  const assignmentError = todo.assignmentBasis === "explicit"
    ? memberError(members, todo.familyId, assigneeId, "assignee")
    : null;
  if (assignmentError) return failure(assignmentError);

  return success({
    ...todo,
    domainId: domain.id,
    assigneeId,
    version: todo.version + 1,
  });
}

/** Sets an open, current, same-domain todo as the domain's next action. */
export function setDomainNextAction(command = {}) {
  if (!isRecord(command)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_INPUT);
  const { domain, todo, members, expectedDomainVersion, expectedTodoVersion } = command;
  const error = domainError(domain, members);
  if (error) return failure(error);
  if (!hasValidTodoFields(todo)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_TODO);
  if (!isPositiveVersion(todo.version)) return failure(DOMAIN_COMMAND_ERROR_CODES.INVALID_VERSION);
  const domainVersion = versionError(domain.version, expectedDomainVersion);
  if (domainVersion) return failure(domainVersion);
  const todoVersion = versionError(todo.version, expectedTodoVersion);
  if (todoVersion) return failure(todoVersion);
  if (todo.familyId !== domain.familyId) return failure(DOMAIN_COMMAND_ERROR_CODES.FAMILY_MISMATCH);
  if (todo.domainId !== domain.id) return failure(DOMAIN_COMMAND_ERROR_CODES.TODO_NOT_IN_DOMAIN);
  if (todo.status !== "open") return failure(DOMAIN_COMMAND_ERROR_CODES.TODO_NOT_OPEN);
  const assignmentError = todoAssignmentError(todo, domain, members);
  if (assignmentError) return failure(assignmentError);

  return success({
    ...domain,
    nextActionId: todo.id,
    version: domain.version + 1,
  });
}
