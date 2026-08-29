const SUGGESTION_FIELDS = [
  "shareableFacts",
  "privateExpressions",
  "responsibilityRequests",
  "domainSuggestion",
  "proposedOwnerId",
  "missingFields",
  "clarificationQuestions",
  "confidence",
];

const MISSING_FIELDS = new Set(["time", "identity", "scope", "owner"]);
const MEMBER_FIELDS = ["id", "familyId", "displayName", "kind", "version"];

/**
 * Validates untrusted model output without deriving identity, authority, or ownership.
 * Only one complete same-family human Member record can resolve a proposed owner.
 */
export function validateResponsibilitySuggestion(candidate, { members = [], familyId } = {}) {
  const issues = [];
  if (!isPlainObject(candidate) || !hasExactKeys(candidate, SUGGESTION_FIELDS)) {
    return invalid(["schema_invalid"]);
  }

  for (const field of ["shareableFacts", "privateExpressions", "responsibilityRequests", "clarificationQuestions"]) {
    if (!isTextList(candidate[field])) issues.push("schema_invalid");
  }
  if (typeof candidate.domainSuggestion !== "string" || !candidate.domainSuggestion.trim()) {
    issues.push("schema_invalid");
  }
  if (candidate.proposedOwnerId !== null && !isSafeId(candidate.proposedOwnerId)) {
    issues.push("schema_invalid");
  }
  if (!Array.isArray(candidate.missingFields) || !candidate.missingFields.every((field) => typeof field === "string" && MISSING_FIELDS.has(field))) {
    issues.push("schema_invalid");
  }
  if (new Set(candidate.missingFields).size !== candidate.missingFields.length) issues.push("schema_invalid");
  if (typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) {
    issues.push("schema_invalid");
  }

  const knownHumanIds = toKnownHumanIds(members, familyId);
  if (candidate.proposedOwnerId !== null && !knownHumanIds.has(candidate.proposedOwnerId)) {
    issues.push("unresolved_owner_id");
  }
  const ownerMissing = candidate.missingFields.includes("owner");
  if ((ownerMissing && candidate.proposedOwnerId !== null) || (!ownerMissing && candidate.proposedOwnerId === null)) {
    issues.push("owner_resolution_invalid");
  }
  if (candidate.missingFields.length > 0 && candidate.clarificationQuestions.length === 0) {
    issues.push("missing_clarification");
  }

  if (issues.length > 0) return invalid(issues);
  return { ok: true, value: freezeDeep(clone(candidate)) };
}

/**
 * Calls an injected provider at most twice. Provider failures and invalid output are
 * intentionally reduced to fixed codes so raw prompts, output, and errors cannot escape.
 */
export async function analyzeResponsibility({ provider, input, members = [], familyId } = {}) {
  if (typeof provider !== "function") return manualRequired(["provider_unavailable"], 0);

  const safeInput = freezeDeep(clone(input));
  const safeMembers = freezeDeep(clone(members));
  const failureCodes = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let candidate;
    try {
      candidate = await provider(safeInput, { attempt });
    } catch {
      failureCodes.push("provider_failure");
      continue;
    }
    const validation = validateResponsibilitySuggestion(candidate, { members: safeMembers, familyId });
    if (validation.ok) return freezeDeep({ status: "suggested", attempts: attempt, suggestion: validation.value });
    failureCodes.push(...validation.issues);
  }
  return manualRequired(unique(failureCodes), 2);
}

function manualRequired(issueCodes, attempts) {
  return freezeDeep({ status: "manual_required", attempts, issueCodes });
}

function invalid(issues) {
  return { ok: false, issues: unique(issues) };
}

function toKnownHumanIds(members, requestedFamilyId) {
  const ids = new Set();
  if (!Array.isArray(members)) return ids;
  const validMembers = members.filter(isCompleteMember);
  const familyIds = new Set(validMembers.map((member) => member.familyId));
  const familyId = requestedFamilyId === undefined
    ? (familyIds.size === 1 ? [...familyIds][0] : null)
    : requestedFamilyId;
  if (!isSafeId(familyId)) return ids;

  const idCounts = new Map();
  for (const member of members) {
    const id = typeof member === "string" ? member : member?.id;
    if (isSafeId(id)) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  for (const member of validMembers) {
    if (member.kind === "human" && member.familyId === familyId && idCounts.get(member.id) === 1) ids.add(member.id);
  }
  return ids;
}

function isCompleteMember(value) {
  return isPlainObject(value) && hasExactKeys(value, MEMBER_FIELDS)
    && isSafeId(value.id) && isSafeId(value.familyId)
    && typeof value.displayName === "string" && value.displayName.trim().length > 0
    && (value.kind === "human" || value.kind === "agent")
    && Number.isSafeInteger(value.version) && value.version > 0;
}

function hasExactKeys(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isTextList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isSafeId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function freezeDeep(value) {
  if (Array.isArray(value) || isPlainObject(value)) {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

function unique(values) {
  return [...new Set(values)];
}
