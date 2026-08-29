const EVIDENCE_KINDS = new Set(["shareable_fact", "private_expression", "responsibility_request"]);
const AUDIT_ENTITY_TYPES = new Set(["responsibility_domain", "handover", "todo", "reminder", "evidence"]);
const AUDIT_METADATA_KEYS = new Set(["domainId", "handoverId", "todoId", "reminderId", "evidenceId", "fromOwnerId", "toOwnerId", "proposedOwnerId", "status", "version", "domainVersion", "previousDomainVersion", "expectedDomainVersion", "handoverVersion"]);
const EVIDENCE_KEYS = new Set(["id", "familyId", "subjectMemberId", "createdByMemberId", "kind", "visibility", "content", "version"]);
const CONSENT_KEYS = new Set(["id", "evidenceId", "subjectMemberId", "grantedVisibility", "status", "version"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const isVersion = (value) => Number.isSafeInteger(value) && value >= 1;
const fail = (code) => freeze({ ok: false, error: { code } });

function freeze(value, seen = new WeakSet()) {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freeze(child, seen);
    Object.freeze(value);
  }
  return value;
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validEvidence(value) {
  return isRecord(value) && onlyKeys(value, EVIDENCE_KEYS) && isText(value.id) && isText(value.familyId)
    && isText(value.subjectMemberId) && isText(value.createdByMemberId) && EVIDENCE_KINDS.has(value.kind)
    && value.visibility === "private" && isText(value.content) && isVersion(value.version);
}

function validConsent(value) {
  return isRecord(value) && onlyKeys(value, CONSENT_KEYS) && isText(value.id) && isText(value.evidenceId)
    && isText(value.subjectMemberId) && value.grantedVisibility === "family"
    && (value.status === "granted" || value.status === "revoked") && isVersion(value.version);
}

function validMember(value) {
  return isRecord(value) && isText(value.id) && isText(value.familyId) && value.status === "active";
}

function safeEvidence(evidence) {
  return freeze({ id: evidence.id, familyId: evidence.familyId, subjectMemberId: evidence.subjectMemberId, createdByMemberId: evidence.createdByMemberId, kind: evidence.kind, visibility: evidence.visibility, content: evidence.content, version: evidence.version });
}

function hasGrantedConsent(evidence, consents) {
  const matching = consents.filter((consent) => validConsent(consent) && consent.evidenceId === evidence.id && consent.subjectMemberId === evidence.subjectMemberId);
  if (matching.length === 0) return false;
  const latestVersion = Math.max(...matching.map((consent) => consent.version));
  const latest = matching.filter((consent) => consent.version === latestVersion);
  return latest.length === 1 && latest[0].status === "granted";
}

/** Creates a private-by-default Evidence record using the frozen API contract. */
export function createEvidence(input) {
  if (!isRecord(input) || !isText(input.id) || !isText(input.familyId) || !isText(input.subjectMemberId)
    || !isText(input.createdByMemberId) || !EVIDENCE_KINDS.has(input.kind) || !isText(input.content)
    || !isVersion(input.version) || (input.visibility !== undefined && input.visibility !== "private")) return fail("evidence_invalid");
  return freeze({ ok: true, evidence: safeEvidence({ ...input, visibility: "private" }) });
}

/** Returns a separate granted Consent record; Evidence itself is never mutated. */
export function grantFamilyConsent(evidence, actorId, consent) {
  if (!validEvidence(evidence) || !validConsent(consent)) return fail("consent_invalid");
  if (actorId !== evidence.subjectMemberId || consent.subjectMemberId !== evidence.subjectMemberId || consent.evidenceId !== evidence.id) return fail("consent_forbidden");
  if (consent.status !== "granted") return fail("consent_invalid");
  return freeze({ ok: true, consent: { ...consent } });
}

/** Revocation is subject-only and returns an independent revoked Consent record. */
export function revokeFamilyConsent(evidence, actorId, consent) {
  if (!validEvidence(evidence) || !validConsent(consent)) return fail("consent_invalid");
  if (actorId !== evidence.subjectMemberId || consent.subjectMemberId !== evidence.subjectMemberId || consent.evidenceId !== evidence.id) return fail("consent_forbidden");
  if (consent.status !== "revoked") return fail("consent_invalid");
  return freeze({ ok: true, consent: { ...consent } });
}

function projectMetadata(metadata) {
  if (!isRecord(metadata)) return freeze({});
  const result = {};
  for (const key of AUDIT_METADATA_KEYS) {
    const value = metadata[key];
    if (["string", "number", "boolean"].includes(typeof value) || value === null) result[key] = value;
  }
  return freeze(result);
}

/** Rebuilds AuditLogEntry values from exact contract fields and a scalar metadata allowlist. */
export function projectAudit(audit, familyId) {
  if (!Array.isArray(audit) || !isText(familyId)) return freeze([]);
  return freeze(audit.flatMap((entry) => {
    if (!isRecord(entry) || entry.familyId !== familyId || !isText(entry.id) || !isText(entry.actorId) || !isText(entry.action)
      || !AUDIT_ENTITY_TYPES.has(entry.entityType) || !isText(entry.entityId) || !isText(entry.occurredAt)) return [];
    return [{ id: entry.id, familyId: entry.familyId, actorId: entry.actorId, action: entry.action, entityType: entry.entityType, entityId: entry.entityId, occurredAt: entry.occurredAt, metadata: projectMetadata(entry.metadata) }];
  }));
}

/** Role is presentation metadata; active family membership, not role, defines this projection boundary. */
export function projectResponsibilityState(state, activeMemberId) {
  if (!isRecord(state) || !Array.isArray(state.members) || !isText(activeMemberId)) return fail("viewer_unauthorized");
  const viewer = state.members.find((member) => validMember(member) && member.id === activeMemberId);
  if (!viewer) return fail("viewer_unauthorized");
  const evidence = Array.isArray(state.evidence) ? state.evidence.filter(validEvidence) : [];
  const consents = Array.isArray(state.consents) ? state.consents.filter(validConsent) : [];
  const privateEvidence = evidence.filter((item) => item.familyId === viewer.familyId && (item.subjectMemberId === viewer.id || item.createdByMemberId === viewer.id)).map(safeEvidence);
  const familyEvidence = evidence.filter((item) => item.familyId === viewer.familyId && item.kind === "shareable_fact" && hasGrantedConsent(item, consents)).map(safeEvidence);
  return freeze({ ok: true, projection: { viewer: { id: viewer.id, role: isText(viewer.role) ? viewer.role : "member" }, privateEvidence, familyEvidence, audit: projectAudit(state.audit, viewer.familyId) } });
}
