export const HANDOVER_REQUIRED_FIELDS = Object.freeze([
  "domainId",
  "fromOwnerId",
  "proposedOwnerId",
]);

export const HandoverCode = Object.freeze({
  OK: "ok",
  INVALID_TRANSITION: "invalid_transition",
  PERMISSION: "permission",
  INCOMPLETE: "incomplete",
  NOT_EXPIRED: "not_expired",
  CONFLICT: "conflict",
});

const PENDING_STATUSES = new Set(["pending_info", "pending_ack"]);
const REVISABLE_FIELDS = new Set(["proposedOwnerId", "expiresAt", "missingFields"]);
const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const HANDOVER_FIELDS = new Set([
  "id", "familyId", "domainId", "fromOwnerId", "proposedOwnerId", "status",
  "missingFields", "confirmationRequiredFromId", "acknowledgements", "expectedDomainVersion", "expiresAt", "version",
]);

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }
  return value;
}

function result(ok, code, domain, handover) {
  const safeHandover = handover && Object.fromEntries(
    Object.entries(handover).filter(([key]) => HANDOVER_FIELDS.has(key)).map(([key, value]) => [key, copy(value)]),
  );
  return { ok, code, domain: copy(domain), handover: safeHandover };
}

function versionMatches(entity, expectedVersion) {
  return Number.isInteger(expectedVersion) && expectedVersion > 0 && expectedVersion === entity.version;
}

function hasValue(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function structuralMissingFields(handover) {
  return HANDOVER_REQUIRED_FIELDS.filter((field) => !hasValue(handover[field]));
}

function hasSafeMissingFields(value) {
  return Array.isArray(value) && value.every((field) => typeof field === "string" && SAFE_FIELD_NAME.test(field));
}

function hasUniqueSafeMissingFields(value) {
  return hasSafeMissingFields(value) && new Set(value).size === value.length;
}

function missingFields(handover) {
  return [...new Set([...handover.missingFields, ...structuralMissingFields(handover)])];
}

function belongsToDomain(handover, domain) {
  return handover.domainId === domain.id && handover.familyId === domain.familyId;
}

function domainVersionMatches(handover, domain) {
  return handover.expectedDomainVersion === domain.version;
}

function nextPendingHandover(handover) {
  const missing = missingFields(handover);
  const complete = missing.length === 0;
  return {
    ...handover,
    status: complete ? "pending_ack" : "pending_info",
    missingFields: missing,
    confirmationRequiredFromId: complete ? handover.proposedOwnerId : null,
  };
}

function canManage(handover, actorId) {
  return actorId === handover.fromOwnerId || actorId === handover.confirmationRequiredFromId;
}

/** Moves a draft to a deterministic pending state without changing domain ownership. */
export function submitHandover({ domain, handover, actorId, expectedVersion } = {}) {
  if (!domain || !handover || handover.status !== "draft" || !belongsToDomain(handover, domain)) {
    return result(false, HandoverCode.INVALID_TRANSITION, domain, handover);
  }
  if (!versionMatches(handover, expectedVersion) || !domainVersionMatches(handover, domain)) return result(false, HandoverCode.CONFLICT, domain, handover);
  if (actorId !== domain.accountableOwnerId || actorId !== handover.fromOwnerId) {
    return result(false, HandoverCode.PERMISSION, domain, handover);
  }
  if (!hasSafeMissingFields(handover.missingFields)) return result(false, HandoverCode.INVALID_TRANSITION, domain, handover);

  const next = nextPendingHandover({ ...handover, version: handover.version + 1 });
  return result(true, next.status === "pending_info" ? HandoverCode.INCOMPLETE : HandoverCode.OK, domain, next);
}

/** Revises only proposal fields, invalidates acknowledgements, and recomputes the pending state. */
export function reviseHandover({ domain, handover, actorId, expectedVersion, patch } = {}) {
  if (!domain || !handover || !PENDING_STATUSES.has(handover.status) || !belongsToDomain(handover, domain)) {
    return result(false, HandoverCode.INVALID_TRANSITION, domain, handover);
  }
  if (!versionMatches(handover, expectedVersion) || !domainVersionMatches(handover, domain)) return result(false, HandoverCode.CONFLICT, domain, handover);
  if (!canManage(handover, actorId)) return result(false, HandoverCode.PERMISSION, domain, handover);
  if (!hasSafeMissingFields(handover.missingFields)) return result(false, HandoverCode.INVALID_TRANSITION, domain, handover);
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !REVISABLE_FIELDS.has(key))) {
    return result(false, HandoverCode.INVALID_TRANSITION, domain, handover);
  }
  if ("missingFields" in patch && !hasUniqueSafeMissingFields(patch.missingFields)) {
    return result(false, HandoverCode.INVALID_TRANSITION, domain, handover);
  }

  const next = nextPendingHandover({
    ...handover,
    ...copy(patch),
    acknowledgements: [],
    version: handover.version + 1,
  });
  return result(true, next.status === "pending_info" ? HandoverCode.INCOMPLETE : HandoverCode.OK, domain, next);
}

/** Declines only a current acknowledgement request; ownership remains untouched. */
export function declineHandover({ domain, handover, actorId, expectedVersion } = {}) {
  if (!domain || !handover || handover.status !== "pending_ack" || !belongsToDomain(handover, domain)) {
    return result(false, HandoverCode.INVALID_TRANSITION, domain, handover);
  }
  if (!versionMatches(handover, expectedVersion) || !domainVersionMatches(handover, domain)) return result(false, HandoverCode.CONFLICT, domain, handover);
  if (actorId !== handover.confirmationRequiredFromId) return result(false, HandoverCode.PERMISSION, domain, handover);

  return result(true, HandoverCode.OK, domain, {
    ...handover,
    status: "declined",
    confirmationRequiredFromId: null,
    version: handover.version + 1,
  });
}

/** Expires an overdue pending handover; null expiry and equality with expiry are not overdue. */
export function expireHandover({ domain, handover, now, expectedVersion } = {}) {
  if (!domain || !handover || !PENDING_STATUSES.has(handover.status) || !belongsToDomain(handover, domain)) {
    return result(false, HandoverCode.INVALID_TRANSITION, domain, handover);
  }
  if (!versionMatches(handover, expectedVersion) || !domainVersionMatches(handover, domain)) return result(false, HandoverCode.CONFLICT, domain, handover);
  if (handover.expiresAt === null) return result(false, HandoverCode.NOT_EXPIRED, domain, handover);
  const expiresAt = Date.parse(handover.expiresAt);
  const currentTime = Date.parse(now);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(currentTime) || currentTime <= expiresAt) {
    return result(false, HandoverCode.NOT_EXPIRED, domain, handover);
  }

  return result(true, HandoverCode.OK, domain, {
    ...handover,
    status: "expired",
    confirmationRequiredFromId: null,
    version: handover.version + 1,
  });
}
