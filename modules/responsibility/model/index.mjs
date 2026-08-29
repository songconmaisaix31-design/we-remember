/**
 * Closed-world P0 responsibility records.  These validators are deliberately
 * dependency-free so every external value is checked before domain code sees it.
 */
export const MEMBER_KINDS = Object.freeze(['human', 'agent']);
export const DOMAIN_STATUSES = Object.freeze(['active', 'paused', 'completed']);
export const VISIBILITIES = Object.freeze(['private', 'family']);
export const HANDOVER_STATUSES = Object.freeze([
  'draft', 'pending_info', 'pending_ack', 'accepted', 'declined', 'expired',
]);
export const TODO_STATUSES = Object.freeze(['open', 'completed', 'cancelled']);
export const EVIDENCE_KINDS = Object.freeze([
  'shareable_fact', 'private_expression', 'responsibility_request',
]);
export const CONSENT_STATUSES = Object.freeze(['granted', 'revoked']);
export const REMINDER_SOURCE_TYPES = Object.freeze(['event', 'todo', 'domain_review', 'handover']);
export const REMINDER_ROUTING_BASES = Object.freeze([
  'event_participant', 'todo_assignee', 'domain_owner', 'handover_confirmer',
]);
export const REMINDER_STATUSES = Object.freeze(['pending', 'cancelled', 'completed']);
export const AUDIT_ENTITY_TYPES = Object.freeze([
  'responsibility_domain', 'handover', 'todo', 'reminder', 'evidence',
]);

const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 4096;
const MAX_ARRAY_LENGTH = 256;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SAFE_ERROR = Object.freeze({ code: 'INVALID_RECORD', message: 'Record validation failed.' });

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isEnum = (values, value) => values.includes(value);
const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH;
const isVersion = (value) => Number.isSafeInteger(value) && value > 0;
const isTimestamp = (value) => typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
const isNullableId = (value) => value === null || isId(value);
const isNullableTimestamp = (value) => value === null || isTimestamp(value);
const isIdArray = (value) => Array.isArray(value)
  && value.length <= MAX_ARRAY_LENGTH
  && value.every(isId)
  && new Set(value).size === value.length;
const isTextArray = (value) => Array.isArray(value)
  && value.length <= MAX_ARRAY_LENGTH
  && value.every(isText)
  && new Set(value).size === value.length;

function exactObject(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => hasOwn(value, key));
}

function freezeValue(value) {
  if (Array.isArray(value)) {
    for (const item of value) freezeValue(item);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) freezeValue(item);
  }
  return Object.freeze(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function success(value) {
  return Object.freeze({ ok: true, value: freezeValue(clone(value)) });
}

function failure() {
  return Object.freeze({ ok: false, error: SAFE_ERROR });
}

const validate = (input, keys, predicate) => exactObject(input, keys) && predicate(input) ? success(input) : failure();

/** The member record used to enforce human ownership; agent members cannot own domains. */
export function validateMember(input) {
  const keys = ['id', 'familyId', 'displayName', 'kind', 'version'];
  return validate(input, keys, (value) => isId(value.id) && isId(value.familyId)
    && isText(value.displayName) && isEnum(MEMBER_KINDS, value.kind) && isVersion(value.version));
}

export function validateResponsibilityDomain(input) {
  const keys = ['id', 'familyId', 'title', 'accountableOwnerId', 'status', 'scopeIncluded', 'scopeExcluded', 'nextActionId', 'visibility', 'evidenceIds', 'version'];
  return validate(input, keys, (value) => isId(value.id) && isId(value.familyId) && isText(value.title)
    && isId(value.accountableOwnerId) && isEnum(DOMAIN_STATUSES, value.status)
    && isTextArray(value.scopeIncluded) && isTextArray(value.scopeExcluded)
    && isNullableId(value.nextActionId) && isEnum(VISIBILITIES, value.visibility)
    && isIdArray(value.evidenceIds) && isVersion(value.version));
}

export function validateFamilyEvent(input) {
  const keys = ['id', 'familyId', 'title', 'startsAt', 'participantIds', 'supportMemberIds', 'informedMemberIds', 'domainId'];
  return validate(input, keys, (value) => isId(value.id) && isId(value.familyId) && isText(value.title)
    && isTimestamp(value.startsAt) && isIdArray(value.participantIds) && isIdArray(value.supportMemberIds)
    && isIdArray(value.informedMemberIds) && isNullableId(value.domainId));
}

export function validateTodo(input) {
  const keys = ['id', 'familyId', 'title', 'domainId', 'assigneeId', 'assignmentBasis', 'dueAt', 'status', 'version'];
  return validate(input, keys, (value) => isId(value.id) && isId(value.familyId) && isText(value.title)
    && isNullableId(value.domainId) && isId(value.assigneeId)
    && isEnum(['domain_owner', 'explicit'], value.assignmentBasis) && isNullableTimestamp(value.dueAt)
    && isEnum(TODO_STATUSES, value.status) && isVersion(value.version));
}

function isAcknowledgement(value) {
  return exactObject(value, ['memberId', 'handoverVersion', 'acknowledgedAt'])
    && isId(value.memberId) && isVersion(value.handoverVersion) && isTimestamp(value.acknowledgedAt);
}

export function validateHandover(input) {
  const keys = ['id', 'familyId', 'domainId', 'fromOwnerId', 'proposedOwnerId', 'status', 'missingFields', 'confirmationRequiredFromId', 'acknowledgements', 'expectedDomainVersion', 'expiresAt', 'version'];
  return validate(input, keys, (value) => isId(value.id) && isId(value.familyId) && isId(value.domainId)
    && isId(value.fromOwnerId) && isId(value.proposedOwnerId) && isEnum(HANDOVER_STATUSES, value.status)
    && isTextArray(value.missingFields) && isNullableId(value.confirmationRequiredFromId)
    && Array.isArray(value.acknowledgements) && value.acknowledgements.length <= MAX_ARRAY_LENGTH
    && value.acknowledgements.every(isAcknowledgement)
    && new Set(value.acknowledgements.map((item) => `${item.memberId}:${item.handoverVersion}`)).size === value.acknowledgements.length
    && isVersion(value.expectedDomainVersion) && isNullableTimestamp(value.expiresAt) && isVersion(value.version));
}

export function validateEvidence(input) {
  const keys = ['id', 'familyId', 'subjectMemberId', 'createdByMemberId', 'kind', 'visibility', 'content', 'version'];
  return validate(input, keys, (value) => isId(value.id) && isId(value.familyId)
    && isId(value.subjectMemberId) && isId(value.createdByMemberId)
    && isEnum(EVIDENCE_KINDS, value.kind) && isEnum(VISIBILITIES, value.visibility)
    && isText(value.content) && isVersion(value.version));
}

export function validateConsent(input) {
  const keys = ['id', 'evidenceId', 'subjectMemberId', 'grantedVisibility', 'status', 'version'];
  return validate(input, keys, (value) => isId(value.id) && isId(value.evidenceId)
    && isId(value.subjectMemberId) && value.grantedVisibility === 'family'
    && isEnum(CONSENT_STATUSES, value.status) && isVersion(value.version));
}

export function validateReminderPlan(input) {
  const keys = ['id', 'sourceType', 'sourceId', 'sourceVersion', 'routingBasis', 'recipientId', 'status'];
  return validate(input, keys, (value) => isId(value.id) && isEnum(REMINDER_SOURCE_TYPES, value.sourceType)
    && isId(value.sourceId) && isVersion(value.sourceVersion)
    && isEnum(REMINDER_ROUTING_BASES, value.routingBasis) && isId(value.recipientId)
    && isEnum(REMINDER_STATUSES, value.status));
}

function isMetadata(value) {
  return isObject(value) && Object.keys(value).length <= MAX_ARRAY_LENGTH
    && Object.entries(value).every(([key, item]) => isId(key)
      && (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null)
      && (typeof item !== 'string' || item.length <= MAX_TEXT_LENGTH)
      && (typeof item !== 'number' || Number.isFinite(item)));
}

export function validateAuditLogEntry(input) {
  const keys = ['id', 'familyId', 'actorId', 'action', 'entityType', 'entityId', 'occurredAt', 'metadata'];
  return validate(input, keys, (value) => isId(value.id) && isId(value.familyId) && isId(value.actorId)
    && isText(value.action) && isEnum(AUDIT_ENTITY_TYPES, value.entityType)
    && isId(value.entityId) && isTimestamp(value.occurredAt) && isMetadata(value.metadata));
}

/** Enforces the product invariant that only a human member can be accountable. */
export function validateHumanAccountableOwner(member, ownerId) {
  const memberResult = validateMember(member);
  if (!memberResult.ok || memberResult.value.id !== ownerId || memberResult.value.kind !== 'human') return failure();
  return success(memberResult.value);
}
