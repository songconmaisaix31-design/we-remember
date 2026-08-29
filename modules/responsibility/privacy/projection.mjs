const FAMILY_ROLES = new Set(["mother", "father", "grandmother"]);
const EVIDENCE_KINDS = new Set(["shareable_fact", "private_expression"]);

const fail = (code) => freeze({ ok: false, error: { code } });
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;

function freeze(value, seen = new WeakSet()) {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freeze(child, seen);
    Object.freeze(value);
  }
  return value;
}

function validEvidence(input) {
  return isRecord(input)
    && isText(input.id)
    && isText(input.familyId)
    && isText(input.subjectId)
    && isText(input.creatorId)
    && EVIDENCE_KINDS.has(input.kind)
    && Number.isSafeInteger(input.version)
    && input.version >= 1
    && isText(input.createdAt)
    && isText(input.updatedAt);
}

function validConsent(consent, evidence) {
  return isRecord(consent)
    && consent.status === "granted"
    && consent.evidenceId === evidence.id
    && consent.familyId === evidence.familyId
    && consent.subjectId === evidence.subjectId
    && Number.isSafeInteger(consent.version)
    && consent.version === evidence.version
    && isText(consent.grantedAt);
}

function safeFact(evidence) {
  return freeze({
    id: evidence.id,
    subjectId: evidence.subjectId,
    kind: evidence.kind,
    version: evidence.version,
    createdAt: evidence.createdAt,
    updatedAt: evidence.updatedAt,
    fact: isText(evidence.fact) ? evidence.fact : "",
  });
}

function safePrivateEvidence(evidence) {
  return freeze({
    id: evidence.id,
    subjectId: evidence.subjectId,
    creatorId: evidence.creatorId,
    kind: evidence.kind,
    version: evidence.version,
    createdAt: evidence.createdAt,
    updatedAt: evidence.updatedAt,
    fact: evidence.kind === "shareable_fact" && isText(evidence.fact) ? evidence.fact : "",
    expression: evidence.kind === "private_expression" && isText(evidence.expression) ? evidence.expression : "",
  });
}

function activeMember(state, activeMemberId) {
  if (!isRecord(state) || !Array.isArray(state.members) || !isText(activeMemberId)) return null;
  const member = state.members.find((candidate) => isRecord(candidate) && candidate.id === activeMemberId);
  return member && isText(member.familyId) && FAMILY_ROLES.has(member.role) && member.status === "active" ? member : null;
}

/** Creates a self-only evidence record. Consent is deliberately absent by default. */
export function createEvidence(input) {
  if (!validEvidence(input)) return fail("evidence_invalid");
  const evidence = {
    id: input.id,
    familyId: input.familyId,
    subjectId: input.subjectId,
    creatorId: input.creatorId,
    kind: input.kind,
    version: input.version,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    fact: input.kind === "shareable_fact" && isText(input.fact) ? input.fact : "",
    expression: input.kind === "private_expression" && isText(input.expression) ? input.expression : "",
    consents: [],
  };
  return freeze({ ok: true, evidence });
}

/** Grants family visibility only when the evidence subject performs the action. */
export function grantFamilyConsent(evidence, actorId, grantedAt) {
  if (!validEvidence(evidence)) return fail("evidence_invalid");
  if (actorId !== evidence.subjectId) return fail("consent_forbidden");
  if (evidence.kind !== "shareable_fact") return fail("consent_not_shareable");
  if (!isText(grantedAt)) return fail("consent_invalid");
  const prior = Array.isArray(evidence.consents) ? evidence.consents.filter((item) => validConsent(item, evidence)) : [];
  const consent = { evidenceId: evidence.id, familyId: evidence.familyId, subjectId: evidence.subjectId, status: "granted", version: evidence.version + 1, grantedAt };
  return freeze({ ok: true, evidence: { ...evidence, version: evidence.version + 1, updatedAt: grantedAt, consents: [...prior, consent] } });
}

/** Revocation is also subject-only and removes all visibility, including malformed records. */
export function revokeFamilyConsent(evidence, actorId, revokedAt) {
  if (!validEvidence(evidence)) return fail("evidence_invalid");
  if (actorId !== evidence.subjectId) return fail("consent_forbidden");
  if (!isText(revokedAt)) return fail("consent_invalid");
  return freeze({ ok: true, evidence: { ...evidence, version: evidence.version + 1, updatedAt: revokedAt, consents: [] } });
}

function hasCurrentConsent(evidence) {
  return evidence.kind === "shareable_fact"
    && Array.isArray(evidence.consents)
    && evidence.consents.some((consent) => validConsent(consent, evidence));
}

/**
 * Projects a responsibility snapshot for one active family member. The result is a
 * presentation projection, not production authentication or authorization evidence.
 */
export function projectResponsibilityState(state, activeMemberId) {
  const viewer = activeMember(state, activeMemberId);
  if (!viewer) return fail("viewer_unauthorized");
  const evidence = Array.isArray(state.evidence) ? state.evidence.filter(validEvidence) : [];
  const privateEvidence = evidence
    .filter((item) => item.familyId === viewer.familyId && (item.subjectId === viewer.id || item.creatorId === viewer.id))
    .map(safePrivateEvidence);
  const familyEvidence = evidence
    .filter((item) => item.familyId === viewer.familyId && hasCurrentConsent(item))
    .map(safeFact);
  const domains = Array.isArray(state.domains) ? state.domains
    .filter((domain) => isRecord(domain) && domain.familyId === viewer.familyId && isText(domain.id) && isText(domain.accountableOwnerId))
    .map((domain) => freeze({ id: domain.id, accountableOwnerId: domain.accountableOwnerId, version: Number.isSafeInteger(domain.version) ? domain.version : 0, status: isText(domain.status) ? domain.status : "unknown" })) : [];
  return freeze({ ok: true, projection: { viewer: { id: viewer.id, role: viewer.role }, domains, privateEvidence, familyEvidence, audit: projectAudit(state.audit, viewer.familyId) } });
}

/** Recursively rebuilds audit values from a closed whitelist, never copying content-bearing keys. */
export function projectAudit(audit, familyId) {
  if (!Array.isArray(audit) || !isText(familyId)) return freeze([]);
  return freeze(audit.filter((entry) => isRecord(entry) && entry.familyId === familyId).map((entry) => ({
    id: isText(entry.id) ? entry.id : "",
    familyId: entry.familyId,
    status: isText(entry.status) ? entry.status : "unknown",
    version: Number.isSafeInteger(entry.version) ? entry.version : 0,
    createdAt: isText(entry.createdAt) ? entry.createdAt : "",
    updatedAt: isText(entry.updatedAt) ? entry.updatedAt : "",
  })));
}
