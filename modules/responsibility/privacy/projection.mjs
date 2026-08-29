const EVIDENCE_KINDS = new Set(["shareable_fact", "private_expression", "responsibility_request"]);
const DOMAIN_STATUSES = new Set(["active", "paused", "completed"]);
const HANDOVER_STATUSES = new Set(["draft", "pending_info", "pending_ack", "accepted", "declined", "expired"]);
const TODO_STATUSES = new Set(["open", "completed", "cancelled"]);
const ASSIGNMENT_BASES = new Set(["domain_owner", "explicit"]);
const REMINDER_STATUSES = new Set(["pending", "cancelled", "completed"]);
const REMINDER_ROUTING = Object.freeze({
  event: "event_participant",
  todo: "todo_assignee",
  domain_review: "domain_owner",
  handover: "handover_confirmer",
});
const NOTICE_TYPES = new Set(["handover_accepted"]);
const VIEWER_CONTEXT_KEYS = new Set(["actorId", "familyId"]);
const EVIDENCE_KEYS = new Set(["id", "familyId", "subjectMemberId", "createdByMemberId", "kind", "visibility", "content", "version"]);
const CONSENT_KEYS = new Set(["id", "evidenceId", "subjectMemberId", "grantedVisibility", "status", "version"]);
const ACCEPTED_AUDIT_METADATA_KEYS = Object.freeze([
  "handoverId",
  "domainId",
  "fromOwnerId",
  "proposedOwnerId",
  "status",
  "previousDomainVersion",
  "domainVersion",
  "handoverVersion",
]);
const SAFE_IDENTIFIER = /^[a-z][a-z0-9:_-]{0,127}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const isIdentifier = (value) => typeof value === "string" && SAFE_IDENTIFIER.test(value);
const isVersion = (value) => Number.isSafeInteger(value) && value >= 1;
const isTimestamp = (value) => typeof value === "string" && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
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
  return isRecord(value) && isIdentifier(value.id) && isIdentifier(value.familyId) && isText(value.displayName)
    && (value.kind === "human" || value.kind === "agent") && isVersion(value.version)
    && (value.status === undefined || value.status === "active");
}

function validHumanViewer(value) {
  return validMember(value) && value.kind === "human";
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

function uniqueMember(members, memberId, familyId, humanOnly = false) {
  const matches = members.filter((member) => isRecord(member) && member.id === memberId);
  if (matches.length !== 1 || !validMember(matches[0]) || matches[0].familyId !== familyId) return null;
  if (humanOnly && matches[0].kind !== "human") return null;
  return matches[0];
}

function resolveViewer(state, viewerContext) {
  let actorId;
  let familyId;
  if (isText(viewerContext)) {
    actorId = viewerContext;
  } else if (isRecord(viewerContext) && onlyKeys(viewerContext, VIEWER_CONTEXT_KEYS)
    && isIdentifier(viewerContext.actorId) && isIdentifier(viewerContext.familyId)) {
    ({ actorId, familyId } = viewerContext);
  } else {
    return null;
  }

  const matches = state.members.filter((member) => isRecord(member) && member.id === actorId);
  if (matches.length !== 1 || !validHumanViewer(matches[0])) return null;
  const viewer = matches[0];
  if (familyId !== undefined && viewer.familyId !== familyId) return null;
  if (state.familyId !== undefined && (!isIdentifier(state.familyId) || state.familyId !== viewer.familyId)) return null;
  return viewer;
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

function projectAcceptedAuditMetadata(metadata, entry) {
  if (!isRecord(metadata) || !ACCEPTED_AUDIT_METADATA_KEYS.every((key) => Object.hasOwn(metadata, key))) return null;
  if (!isIdentifier(metadata.handoverId) || metadata.handoverId !== entry.entityId
    || !isIdentifier(metadata.domainId) || !isIdentifier(metadata.fromOwnerId)
    || !isIdentifier(metadata.proposedOwnerId) || metadata.proposedOwnerId !== entry.actorId
    || metadata.status !== "accepted" || !isVersion(metadata.previousDomainVersion)
    || !isVersion(metadata.domainVersion) || metadata.domainVersion !== metadata.previousDomainVersion + 1
    || !isVersion(metadata.handoverVersion)) return null;
  return {
    handoverId: metadata.handoverId,
    domainId: metadata.domainId,
    fromOwnerId: metadata.fromOwnerId,
    proposedOwnerId: metadata.proposedOwnerId,
    status: metadata.status,
    previousDomainVersion: metadata.previousDomainVersion,
    domainVersion: metadata.domainVersion,
    handoverVersion: metadata.handoverVersion,
  };
}

/** Rebuilds only the currently supported, content-free audit event shape. */
export function projectAudit(audit, familyId) {
  if (!Array.isArray(audit) || !isIdentifier(familyId)) return freeze([]);
  return freeze(audit.flatMap((entry) => {
    if (!isRecord(entry) || entry.familyId !== familyId || !isIdentifier(entry.id)
      || !isIdentifier(entry.actorId) || entry.action !== "handover.accepted"
      || entry.entityType !== "handover" || !isIdentifier(entry.entityId)
      || !isTimestamp(entry.occurredAt)) return [];
    const metadata = projectAcceptedAuditMetadata(entry.metadata, entry);
    if (!metadata || entry.id !== `audit:${entry.entityId}:${metadata.handoverVersion}`) return [];
    return [{
      id: entry.id,
      familyId: entry.familyId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      occurredAt: entry.occurredAt,
      metadata,
    }];
  }));
}

function projectDomains(state, familyId) {
  if (!Array.isArray(state.domains)) return [];
  return state.domains.flatMap((domain) => {
    if (!isRecord(domain) || domain.familyId !== familyId || !isIdentifier(domain.id)
      || !isIdentifier(domain.accountableOwnerId) || !DOMAIN_STATUSES.has(domain.status)
      || domain.visibility !== "family" || !isVersion(domain.version)
      || !uniqueMember(state.members, domain.accountableOwnerId, familyId, true)) return [];
    return [{
      id: domain.id,
      accountableOwnerId: domain.accountableOwnerId,
      status: domain.status,
      version: domain.version,
    }];
  });
}

function projectHandovers(state, familyId, domainIds) {
  if (!Array.isArray(state.handovers)) return [];
  return state.handovers.flatMap((handover) => {
    const confirmerValid = handover?.confirmationRequiredFromId === null
      || (isIdentifier(handover?.confirmationRequiredFromId)
        && uniqueMember(state.members, handover.confirmationRequiredFromId, familyId, true));
    if (!isRecord(handover) || handover.familyId !== familyId || !isIdentifier(handover.id)
      || !isIdentifier(handover.domainId) || !domainIds.has(handover.domainId)
      || !isIdentifier(handover.fromOwnerId) || !uniqueMember(state.members, handover.fromOwnerId, familyId, true)
      || !isIdentifier(handover.proposedOwnerId) || !uniqueMember(state.members, handover.proposedOwnerId, familyId, true)
      || !HANDOVER_STATUSES.has(handover.status) || !confirmerValid || !isVersion(handover.version)) return [];
    return [{
      id: handover.id,
      domainId: handover.domainId,
      fromOwnerId: handover.fromOwnerId,
      proposedOwnerId: handover.proposedOwnerId,
      status: handover.status,
      confirmationRequiredFromId: handover.confirmationRequiredFromId,
      version: handover.version,
    }];
  });
}

function projectTodos(state, familyId, domainIds, domainOwners) {
  if (!Array.isArray(state.todos)) return [];
  return state.todos.flatMap((todo) => {
    const assignee = isIdentifier(todo?.assigneeId)
      ? uniqueMember(state.members, todo.assigneeId, familyId)
      : null;
    const domainValid = todo?.domainId === null || (isIdentifier(todo?.domainId) && domainIds.has(todo.domainId));
    const domainOwnerAligned = todo?.assignmentBasis !== "domain_owner"
      || (todo.domainId !== null && assignee?.kind === "human" && domainOwners.get(todo.domainId) === todo.assigneeId);
    if (!isRecord(todo) || todo.familyId !== familyId || !isIdentifier(todo.id) || !domainValid
      || !assignee || !ASSIGNMENT_BASES.has(todo.assignmentBasis) || !domainOwnerAligned
      || !TODO_STATUSES.has(todo.status) || !isVersion(todo.version)) return [];
    return [{
      id: todo.id,
      domainId: todo.domainId,
      assigneeId: todo.assigneeId,
      assignmentBasis: todo.assignmentBasis,
      status: todo.status,
      version: todo.version,
    }];
  });
}

function familySourceIds(values, familyId) {
  if (!Array.isArray(values)) return new Set();
  return new Set(values.flatMap((value) => (
    isRecord(value) && value.familyId === familyId && isIdentifier(value.id) ? [value.id] : []
  )));
}

function projectReminders(state, viewer, todos, handovers) {
  if (!Array.isArray(state.reminders)) return [];
  const sourceIds = {
    event: familySourceIds(state.events, viewer.familyId),
    todo: new Set(todos.map((todo) => todo.id)),
    domain_review: familySourceIds(state.domainReviews, viewer.familyId),
    handover: new Set(handovers.map((handover) => handover.id)),
  };
  return state.reminders.flatMap((reminder) => {
    if (!isRecord(reminder) || reminder.recipientId !== viewer.id || !isIdentifier(reminder.id)
      || !Object.hasOwn(REMINDER_ROUTING, reminder.sourceType)
      || !isIdentifier(reminder.sourceId) || !sourceIds[reminder.sourceType].has(reminder.sourceId)
      || !isVersion(reminder.sourceVersion) || reminder.routingBasis !== REMINDER_ROUTING[reminder.sourceType]
      || !REMINDER_STATUSES.has(reminder.status)) return [];
    return [{
      id: reminder.id,
      sourceType: reminder.sourceType,
      sourceId: reminder.sourceId,
      sourceVersion: reminder.sourceVersion,
      routingBasis: reminder.routingBasis,
      recipientId: reminder.recipientId,
      status: reminder.status,
    }];
  });
}

function projectNotices(state, viewer, domainIds, handoverIds) {
  if (!Array.isArray(state.notices)) return [];
  return state.notices.flatMap((notice) => {
    if (!isRecord(notice) || notice.familyId !== viewer.familyId || notice.recipientId !== viewer.id
      || !isIdentifier(notice.id) || !NOTICE_TYPES.has(notice.type)
      || !isIdentifier(notice.handoverId) || !handoverIds.has(notice.handoverId)
      || !isIdentifier(notice.domainId) || !domainIds.has(notice.domainId)
      || !isTimestamp(notice.createdAt)) return [];
    return [{
      id: notice.id,
      recipientId: notice.recipientId,
      type: notice.type,
      handoverId: notice.handoverId,
      domainId: notice.domainId,
      createdAt: notice.createdAt,
    }];
  });
}

/** Human family membership defines this projection boundary; role is presentation metadata only. */
export function projectResponsibilityState(state, viewerContext) {
  if (!isRecord(state) || !Array.isArray(state.members)) return fail("viewer_unauthorized");
  const viewer = resolveViewer(state, viewerContext);
  if (!viewer) return fail("viewer_unauthorized");
  const presentationRole = isText(viewer.role) ? viewer.role : viewer.id;
  const evidence = Array.isArray(state.evidence) ? state.evidence.filter(validEvidence) : [];
  const consents = Array.isArray(state.consents) ? state.consents.filter(validConsent) : [];
  const privateEvidence = evidence.filter((item) => item.familyId === viewer.familyId && (item.subjectMemberId === viewer.id || item.createdByMemberId === viewer.id)).map(safeEvidence);
  const familyEvidence = evidence.filter((item) => item.familyId === viewer.familyId
    && item.kind === "shareable_fact" && uniqueMember(state.members, item.subjectMemberId, viewer.familyId, true)
    && hasGrantedConsent(item, consents)).map(safeEvidence);
  const audit = Object.hasOwn(state, "auditLog") ? state.auditLog : state.audit;
  const domains = projectDomains(state, viewer.familyId);
  const domainIds = new Set(domains.map((domain) => domain.id));
  const domainOwners = new Map(domains.map((domain) => [domain.id, domain.accountableOwnerId]));
  const handovers = projectHandovers(state, viewer.familyId, domainIds);
  const todos = projectTodos(state, viewer.familyId, domainIds, domainOwners);
  const reminders = projectReminders(state, viewer, todos, handovers);
  const notices = projectNotices(state, viewer, domainIds, new Set(handovers.map((handover) => handover.id)));
  return freeze({
    ok: true,
    projection: {
      viewer: { id: viewer.id, role: presentationRole },
      privateEvidence,
      familyEvidence,
      domains,
      handovers,
      todos,
      reminders,
      notices,
      audit: projectAudit(audit, viewer.familyId),
    },
  });
}
