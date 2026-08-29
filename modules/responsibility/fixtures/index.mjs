const FAMILY_ID = "family-willow";
const MOTHER_ID = "mother";
const FATHER_ID = "father";
const GRANDMOTHER_ID = "grandmother";
const AGENT_ID = "agent";
const DOMAIN_ID = "domain-grandmother-follow-up";
const EVENT_ID = "event-grandmother-follow-up";
const DOMAIN_TODO_ID = "todo-confirm-follow-up-logistics";
const EXPLICIT_TODO_ID = "todo-prepare-follow-up-questions";
const HANDOVER_ID = "handover-grandmother-follow-up-to-father";
const FACT_EVIDENCE_ID = "evidence-grandmother-follow-up-fact";
const EXPRESSION_EVIDENCE_ID = "evidence-mother-follow-up-burden";
const REQUEST_EVIDENCE_ID = "evidence-follow-up-responsibility-request";
const TODO_REMINDER_ID = "reminder-confirm-follow-up-logistics";

/**
 * Creates the deterministic starting snapshot for the P0 responsibility flow.
 * Every call returns new records and arrays so a command can replace or mutate
 * its local snapshot without contaminating another test or demo run.
 */
export function createGoldenResponsibilityFixture() {
  return {
    familyId: FAMILY_ID,
    members: [
      {
        id: MOTHER_ID,
        familyId: FAMILY_ID,
        displayName: "Maya Chen",
        kind: "human",
        version: 1,
      },
      {
        id: FATHER_ID,
        familyId: FAMILY_ID,
        displayName: "Ethan Chen",
        kind: "human",
        version: 1,
      },
      {
        id: GRANDMOTHER_ID,
        familyId: FAMILY_ID,
        displayName: "Mei Chen",
        kind: "human",
        version: 1,
      },
      {
        id: AGENT_ID,
        familyId: FAMILY_ID,
        displayName: "Willow Family Agent",
        kind: "agent",
        version: 1,
      },
    ],
    domains: [
      {
        id: DOMAIN_ID,
        familyId: FAMILY_ID,
        title: "Grandmother follow-up care",
        accountableOwnerId: MOTHER_ID,
        status: "active",
        scopeIncluded: [
          "Coordinate the follow-up visit and its preparation",
          "Track agreed actions after the visit",
        ],
        scopeExcluded: [
          "Make clinical decisions",
          "Provide emergency medical care",
        ],
        nextActionId: DOMAIN_TODO_ID,
        visibility: "family",
        evidenceIds: [
          FACT_EVIDENCE_ID,
          EXPRESSION_EVIDENCE_ID,
          REQUEST_EVIDENCE_ID,
        ],
        version: 1,
      },
    ],
    events: [
      {
        id: EVENT_ID,
        familyId: FAMILY_ID,
        title: "Grandmother follow-up visit",
        startsAt: "2030-04-18T01:30:00.000Z",
        participantIds: [GRANDMOTHER_ID],
        supportMemberIds: [MOTHER_ID],
        informedMemberIds: [FATHER_ID],
        domainId: DOMAIN_ID,
      },
    ],
    todos: [
      {
        id: DOMAIN_TODO_ID,
        familyId: FAMILY_ID,
        title: "Confirm transport and visit documents",
        domainId: DOMAIN_ID,
        assigneeId: MOTHER_ID,
        assignmentBasis: "domain_owner",
        dueAt: "2030-04-16T09:00:00.000Z",
        status: "open",
        version: 1,
      },
      {
        id: EXPLICIT_TODO_ID,
        familyId: FAMILY_ID,
        title: "Prepare a follow-up question checklist",
        domainId: DOMAIN_ID,
        assigneeId: AGENT_ID,
        assignmentBasis: "explicit",
        dueAt: "2030-04-15T09:00:00.000Z",
        status: "open",
        version: 1,
      },
    ],
    handovers: [
      {
        id: HANDOVER_ID,
        familyId: FAMILY_ID,
        domainId: DOMAIN_ID,
        fromOwnerId: MOTHER_ID,
        proposedOwnerId: FATHER_ID,
        status: "draft",
        missingFields: ["time", "scope"],
        confirmationRequiredFromId: null,
        acknowledgements: [],
        expectedDomainVersion: 1,
        expiresAt: null,
        version: 1,
      },
    ],
    evidence: [
      {
        id: FACT_EVIDENCE_ID,
        familyId: FAMILY_ID,
        subjectMemberId: GRANDMOTHER_ID,
        createdByMemberId: MOTHER_ID,
        kind: "shareable_fact",
        visibility: "private",
        content: "Grandmother has a follow-up visit scheduled for 18 April 2030.",
        version: 1,
      },
      {
        id: EXPRESSION_EVIDENCE_ID,
        familyId: FAMILY_ID,
        subjectMemberId: MOTHER_ID,
        createdByMemberId: MOTHER_ID,
        kind: "private_expression",
        visibility: "private",
        content: "I feel overwhelmed carrying all of Grandmother's follow-up coordination by myself.",
        version: 1,
      },
      {
        id: REQUEST_EVIDENCE_ID,
        familyId: FAMILY_ID,
        subjectMemberId: MOTHER_ID,
        createdByMemberId: MOTHER_ID,
        kind: "responsibility_request",
        visibility: "private",
        content: "Please ask Father to take over the follow-up coordination.",
        version: 1,
      },
    ],
    consents: [],
    reminders: [
      {
        id: TODO_REMINDER_ID,
        sourceType: "todo",
        sourceId: DOMAIN_TODO_ID,
        sourceVersion: 1,
        routingBasis: "todo_assignee",
        recipientId: MOTHER_ID,
        status: "pending",
      },
    ],
    auditLog: [],
    notices: [],
    idempotency: [],
  };
}

const asArray = (value) => Array.isArray(value) ? value : [];

function hasCurrentFamilyConsent(evidence, consents) {
  const matching = asArray(consents).filter((consent) => consent?.evidenceId === evidence.id
    && consent?.subjectMemberId === evidence.subjectMemberId
    && consent?.grantedVisibility === "family"
    && Number.isSafeInteger(consent?.version)
    && consent.version > 0);
  if (matching.length === 0) return false;
  const latestVersion = Math.max(...matching.map((consent) => consent.version));
  const latest = matching.filter((consent) => consent.version === latestVersion);
  return latest.length === 1 && latest[0].status === "granted";
}

/** Derives presentation-only facts from the supplied live snapshot. */
export function createPerspectiveFacts(state, perspectiveMemberId) {
  const domain = asArray(state?.domains).find((item) => item?.id === DOMAIN_ID);
  const domainTodo = asArray(state?.todos).find((item) => item?.id === DOMAIN_TODO_ID);
  const handover = asArray(state?.handovers).find((item) => item?.id === HANDOVER_ID);
  const todoReminder = asArray(state?.reminders).find((item) => item?.sourceType === "todo"
    && item.sourceId === DOMAIN_TODO_ID
    && item.status === "pending");
  const handoverReminder = asArray(state?.reminders).find((item) => item?.sourceType === "handover"
    && item.sourceId === HANDOVER_ID);
  const privateEvidenceIds = asArray(state?.evidence)
    .filter((item) => item?.familyId === state?.familyId
      && (item.subjectMemberId === perspectiveMemberId || item.createdByMemberId === perspectiveMemberId))
    .map((item) => item.id);
  const familyEvidenceIds = asArray(state?.evidence)
    .filter((item) => item?.familyId === state?.familyId
      && item.kind === "shareable_fact"
      && hasCurrentFamilyConsent(item, state?.consents))
    .map((item) => item.id);

  return {
    perspectiveMemberId,
    authorizesActions: false,
    domainId: DOMAIN_ID,
    accountableOwnerId: domain?.accountableOwnerId ?? null,
    domainTodoAssigneeId: domainTodo?.assigneeId ?? null,
    reminderRecipientId: todoReminder?.recipientId ?? null,
    handoverStatus: handover?.status ?? null,
    proposedOwnerId: handover?.proposedOwnerId ?? null,
    handoverReminderStatus: handoverReminder?.status ?? null,
    privateEvidenceIds,
    familyEvidenceIds,
    oldOwnerNoticeIds: asArray(state?.notices)
      .filter((notice) => notice?.familyId === state?.familyId
        && notice.recipientId === perspectiveMemberId
        && notice.type === "handover_accepted")
      .map((notice) => notice.id),
  };
}

/** Returns presentation expectations only; it does not establish authorization. */
export function createMotherPerspectiveFacts(state = createGoldenResponsibilityFixture()) {
  return createPerspectiveFacts(state, MOTHER_ID);
}

/** Returns presentation expectations only; it does not establish authorization. */
export function createFatherPerspectiveFacts(state = createGoldenResponsibilityFixture()) {
  return createPerspectiveFacts(state, FATHER_ID);
}

/** Returns presentation expectations only; it does not establish authorization. */
export function createGrandmotherPerspectiveFacts(state = createGoldenResponsibilityFixture()) {
  return createPerspectiveFacts(state, GRANDMOTHER_ID);
}
