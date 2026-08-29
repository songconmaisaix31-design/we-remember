import {
  createGoldenResponsibilityFixture,
  createResponsibilityPorts,
  createResponsibilityService,
  createResponsibilityStore,
  goldenScenarioProvider,
  grantFixtureFamilyConsent,
} from "../index.mjs";

const FAMILY_ID = "family-willow";
const HANDOVER_ID = "handover-grandmother-follow-up-to-father";
const DOMAIN_ID = "domain-grandmother-follow-up";
const TODO_ID = "todo-confirm-follow-up-logistics";
const ACTORS = new Set(["mother", "father", "grandmother"]);
const SAFE_ACTIONS = new Set(["analyze", "completeTodoFlow", "declineFlow", "goldenFlow", "reset"]);
const MAX_TEXT_LENGTH = 2_000;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function failure(code, statusCode = 400) {
  return Object.freeze({
    statusCode,
    body: Object.freeze({
      ok: false,
      error: Object.freeze({
        code,
        message: "The demo request could not be completed.",
      }),
    }),
  });
}

function statusFor(result) {
  const code = result?.error?.code;
  if (["permission", "permission_denied", "viewer_unauthorized"].includes(code)) return 403;
  if (["conflict", "idempotency_conflict", "version_conflict"].includes(code)) return 409;
  return 400;
}

function createInitialState() {
  const consented = grantFixtureFamilyConsent(createGoldenResponsibilityFixture(), {
    evidenceId: "evidence-grandmother-follow-up-fact",
    actorId: "grandmother",
    consent: {
      id: "consent-grandmother-follow-up-fact",
      evidenceId: "evidence-grandmother-follow-up-fact",
      subjectMemberId: "grandmother",
      grantedVisibility: "family",
      status: "granted",
      version: 1,
    },
  });
  if (!consented.ok) throw new Error("Demo fixture could not be initialized.");
  return consented.nextState;
}

export function createDemoRuntime() {
  const store = createResponsibilityStore(createInitialState());
  const service = createResponsibilityService({
    store,
    ports: createResponsibilityPorts({ provider: goldenScenarioProvider }),
  });
  return Object.freeze({ service, store });
}

function caller(actorId) {
  return Object.freeze({ actorId, familyId: FAMILY_ID });
}

async function apply(runtime, method, actorId, command) {
  const result = await runtime.service[method](caller(actorId), command);
  return result.ok ? result : failure(result.error?.code ?? "operation_failed", statusFor(result));
}

async function buildPendingAcknowledgement(runtime) {
  const submitted = await apply(runtime, "submit", "mother", {
    handoverId: HANDOVER_ID,
    expectedVersion: 1,
    idempotencyKey: "serverless-submit-v1",
  });
  if (submitted.statusCode) return submitted;
  const revised = await apply(runtime, "revise", "mother", {
    handoverId: HANDOVER_ID,
    expectedVersion: 2,
    patch: {
      missingFields: [],
      expiresAt: "2030-04-20T00:00:00.000Z",
    },
    idempotencyKey: "serverless-revise-v2",
  });
  return revised.statusCode ? revised : null;
}

async function project(runtime, actorId, flow, suggestion = null) {
  const viewed = await runtime.service.view(caller(actorId));
  if (!viewed.ok) return failure(viewed.error?.code ?? "viewer_unauthorized", statusFor(viewed));
  const { projection } = viewed;
  const domain = projection.domains.find((item) => item.id === DOMAIN_ID) ?? null;
  const handover = projection.handovers.find((item) => item.id === HANDOVER_ID) ?? null;
  const todo = projection.todos.find((item) => item.id === TODO_ID) ?? null;
  const reminder = projection.reminders.find((item) => item.sourceId === TODO_ID
    && item.status === "pending") ?? null;
  return Object.freeze({
    statusCode: 200,
    body: Object.freeze({
      ok: true,
      mode: "demo_stateless_fixture",
      flow,
      revision: runtime.store.currentRevision(),
      actorId,
      suggestion,
      summary: Object.freeze({
        accountableOwnerId: domain?.accountableOwnerId ?? null,
        handoverStatus: handover?.status ?? null,
        todoAssigneeId: todo?.assigneeId ?? null,
        todoStatus: todo?.status ?? null,
        reminderRecipientId: reminder?.recipientId ?? null,
        auditEntries: projection.audit.length,
        oldOwnerNotices: projection.notices.length,
      }),
      projection,
    }),
  });
}

export async function readStatelessDemo(actorId) {
  if (!ACTORS.has(actorId)) return failure("invalid_request");
  return project(createDemoRuntime(), actorId, "baseline");
}

/**
 * Replays a bounded fixture flow inside one request. This does not rely on a
 * serverless process surviving between requests and never accepts client-owned snapshots.
 */
export async function runStatelessDemo(input) {
  if (!isRecord(input) || typeof input.action !== "string" || !SAFE_ACTIONS.has(input.action)) {
    return failure("invalid_request");
  }
  const expectedKeys = input.action === "reset"
    ? ["action", "actorId"]
    : ["action", "actorId", "text"];
  if (!exactKeys(input, expectedKeys) || !ACTORS.has(input.actorId)) {
    return failure("invalid_request");
  }
  if (input.action !== "reset"
    && (typeof input.text !== "string" || input.text.trim().length === 0
      || input.text.length > MAX_TEXT_LENGTH)) {
    return failure("invalid_request");
  }

  const runtime = createDemoRuntime();
  if (input.action === "reset") return project(runtime, input.actorId, "baseline");

  if (input.action === "analyze" && input.actorId !== "mother") {
    return failure("permission_denied", 403);
  }

  const suggestion = await runtime.service.suggest(caller("mother"), { text: input.text.trim() });
  if (suggestion.ok === false) {
    return failure(suggestion.error?.code ?? "operation_failed", statusFor(suggestion));
  }
  if (input.action === "analyze") return project(runtime, input.actorId, "analyzed", suggestion);
  const suggestionForViewer = input.actorId === "mother" ? suggestion : null;

  const pendingFailure = await buildPendingAcknowledgement(runtime);
  if (pendingFailure) return pendingFailure;
  if (input.action === "declineFlow") {
    const declined = await apply(runtime, "decline", "father", {
      handoverId: HANDOVER_ID,
      expectedVersion: 3,
      idempotencyKey: "serverless-decline-v3",
    });
    if (declined.statusCode) return declined;
    return project(runtime, input.actorId, "declined", suggestionForViewer);
  }

  const accepted = await apply(runtime, "accept", "father", {
    handoverId: HANDOVER_ID,
    expectedHandoverVersion: 3,
    expectedDomainVersion: 1,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "serverless-accept-v3",
  });
  if (accepted.statusCode) return accepted;

  if (input.action === "completeTodoFlow") {
    const completed = await apply(runtime, "completeTodo", "father", {
      todoId: TODO_ID,
      expectedVersion: 2,
      idempotencyKey: "serverless-complete-todo-v2",
    });
    if (completed.statusCode) return completed;
    return project(runtime, input.actorId, "accepted_todo_completed", suggestionForViewer);
  }
  return project(runtime, input.actorId, "accepted", suggestionForViewer);
}
