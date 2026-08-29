/**
 * Dependency-free ownership invariants for the P0 responsibility model.
 * Inputs are read only; callers retain ownership of every supplied record.
 */

export const OWNERSHIP_RESULT_CODES = Object.freeze({
  MEMBER_RESOLVED: "member_resolved",
  HUMAN_OWNER_CONFIRMED: "human_owner_confirmed",
  VERSION_CURRENT: "version_current",
  TRANSITION_ALLOWED: "transition_allowed",
});

export const OWNERSHIP_ERROR_CODES = Object.freeze({
  INVALID_FAMILY: "invalid_family",
  INVALID_MEMBER: "invalid_member",
  INVALID_DOMAIN: "invalid_domain",
  MEMBER_MISSING: "member_missing",
  MEMBER_OUTSIDE_FAMILY: "member_outside_family",
  OWNER_MISSING: "owner_missing",
  OWNER_NOT_HUMAN: "owner_not_human",
  OWNER_OUTSIDE_FAMILY: "owner_outside_family",
  INVALID_VERSION: "invalid_version",
  VERSION_CONFLICT: "version_conflict",
  INVALID_HANDOVER_STATUS: "invalid_handover_status",
  TRANSITION_FORBIDDEN: "transition_forbidden",
});

export const HANDOVER_STATUSES = Object.freeze([
  "draft",
  "pending_info",
  "pending_ack",
  "accepted",
  "declined",
  "expired",
]);

export const HANDOVER_TRANSITION_MATRIX = Object.freeze({
  draft: Object.freeze(["pending_info", "pending_ack"]),
  pending_info: Object.freeze(["pending_info", "pending_ack"]),
  pending_ack: Object.freeze(["accepted", "declined", "expired"]),
  accepted: Object.freeze([]),
  declined: Object.freeze([]),
  expired: Object.freeze([]),
});

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function success(code, value = {}) {
  return Object.freeze({ ok: true, code, ...value });
}

function failure(code) {
  return Object.freeze({ ok: false, code });
}

function memberCollection(members) {
  return Array.isArray(members) ? members : null;
}

/**
 * Resolves a member only when the supplied member belongs to the supplied family.
 * Failure results deliberately omit member and family values.
 */
export function resolveMemberInFamily(members, familyId, memberId) {
  const collection = memberCollection(members);
  if (!isNonEmptyString(familyId)) return failure(OWNERSHIP_ERROR_CODES.INVALID_FAMILY);
  if (!isNonEmptyString(memberId)) return failure(OWNERSHIP_ERROR_CODES.INVALID_MEMBER);
  if (collection === null) return failure(OWNERSHIP_ERROR_CODES.MEMBER_MISSING);

  const member = collection.find((candidate) => isPlainRecord(candidate) && candidate.id === memberId);
  if (!member) return failure(OWNERSHIP_ERROR_CODES.MEMBER_MISSING);
  if (member.familyId !== familyId) return failure(OWNERSHIP_ERROR_CODES.MEMBER_OUTSIDE_FAMILY);

  return success(OWNERSHIP_RESULT_CODES.MEMBER_RESOLVED, { member });
}

/**
 * Validates the frozen ResponsibilityDomain owner invariant without mutation.
 */
export function assertHumanAccountableOwner(domain, members) {
  if (!isPlainRecord(domain) || !isNonEmptyString(domain.familyId)) {
    return failure(OWNERSHIP_ERROR_CODES.INVALID_DOMAIN);
  }
  if (!isNonEmptyString(domain.accountableOwnerId)) {
    return failure(OWNERSHIP_ERROR_CODES.OWNER_MISSING);
  }

  const resolved = resolveMemberInFamily(members, domain.familyId, domain.accountableOwnerId);
  if (!resolved.ok) {
    if (resolved.code === OWNERSHIP_ERROR_CODES.MEMBER_OUTSIDE_FAMILY) {
      return failure(OWNERSHIP_ERROR_CODES.OWNER_OUTSIDE_FAMILY);
    }
    if (resolved.code === OWNERSHIP_ERROR_CODES.MEMBER_MISSING) {
      return failure(OWNERSHIP_ERROR_CODES.OWNER_MISSING);
    }
    return resolved;
  }
  if (resolved.member.kind !== "human") return failure(OWNERSHIP_ERROR_CODES.OWNER_NOT_HUMAN);

  return success(OWNERSHIP_RESULT_CODES.HUMAN_OWNER_CONFIRMED, { owner: resolved.member });
}

/**
 * Applies optimistic concurrency semantics: both versions are positive integers
 * and the expected version must exactly equal the current version.
 */
export function compareOptimisticVersion(currentVersion, expectedVersion) {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    return failure(OWNERSHIP_ERROR_CODES.INVALID_VERSION);
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return failure(OWNERSHIP_ERROR_CODES.INVALID_VERSION);
  }
  if (currentVersion !== expectedVersion) return failure(OWNERSHIP_ERROR_CODES.VERSION_CONFLICT);
  return success(OWNERSHIP_RESULT_CODES.VERSION_CURRENT);
}

/**
 * Returns whether a status transition is part of the frozen P0 handover graph.
 */
export function isAllowedHandoverTransition(fromStatus, toStatus) {
  return HANDOVER_TRANSITION_MATRIX[fromStatus]?.includes(toStatus) === true;
}

/**
 * Validates a handover transition while exposing only a stable result code.
 */
export function assertHandoverTransition(fromStatus, toStatus) {
  if (!HANDOVER_STATUSES.includes(fromStatus) || !HANDOVER_STATUSES.includes(toStatus)) {
    return failure(OWNERSHIP_ERROR_CODES.INVALID_HANDOVER_STATUS);
  }
  if (!isAllowedHandoverTransition(fromStatus, toStatus)) {
    return failure(OWNERSHIP_ERROR_CODES.TRANSITION_FORBIDDEN);
  }
  return success(OWNERSHIP_RESULT_CODES.TRANSITION_ALLOWED);
}
