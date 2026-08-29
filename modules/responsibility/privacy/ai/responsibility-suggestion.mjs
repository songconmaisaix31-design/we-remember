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

/**
 * Validates untrusted model output without deriving identity, authority, or ownership.
 * `members` may contain IDs or `{ id, kind }` records; only listed human IDs are allowed.
 */
export function validateResponsibilitySuggestion(candidate, { members = [] } = {}) {
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

  const knownHumanIds = toKnownHumanIds(members);
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
export async function analyzeResponsibility({ provider, input, members = [] } = {}) {
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
    const validation = validateResponsibilitySuggestion(candidate, { members: safeMembers });
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

function toKnownHumanIds(members) {
  const ids = new Set();
  if (!Array.isArray(members)) return ids;
  for (const member of members) {
    if (typeof member === "string" && isSafeId(member)) ids.add(member);
    if (isPlainObject(member) && member.kind === "human" && isSafeId(member.id)) ids.add(member.id);
  }
  return ids;
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
