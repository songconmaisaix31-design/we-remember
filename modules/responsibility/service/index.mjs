const REQUIRED_PORTS = Object.freeze([
  "analyzeResponsibility",
  "submitHandover",
  "reviseHandover",
  "declineHandover",
  "expireHandover",
  "acceptHandover",
  "completeTodo",
  "projectForActor",
]);

const SAFE_ERROR_MESSAGE = "Responsibility operation could not be completed.";
const SAFE_ERROR_CODES = new Set([
  "INVALID_DOMAIN_REVIEW",
  "INVALID_EVENT",
  "INVALID_HANDOVER",
  "INVALID_SOURCES",
  "INVALID_TODO",
  "STALE_SOURCE_VERSION",
  "TODO_NOT_MIGRATABLE",
  "conflict",
  "handover_expired",
  "idempotency_conflict",
  "incomplete",
  "incomplete_handover",
  "invalid_caller_context",
  "invalid_input",
  "invalid_request",
  "invalid_result",
  "invalid_transition",
  "not_expired",
  "operation_failed",
  "permission",
  "permission_denied",
  "store_unavailable",
  "version_conflict",
  "viewer_unauthorized",
]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const EXPECTED_VERSION_FIELDS = Object.freeze([
  "expectedVersion",
  "expectedHandoverVersion",
  "expectedDomainVersion",
  "expectedTodoVersion",
]);
const INTERNAL_RESULT_KEYS = new Set(["nextState", "state", "snapshot", "error"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function freezeDeep(value, seen = new WeakSet()) {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freezeDeep(child, seen);
    Object.freeze(value);
  }
  return value;
}

function immutableClone(value) {
  return freezeDeep(structuredClone(value));
}

function failure(code) {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message: SAFE_ERROR_MESSAGE }),
  });
}

function safeCodeFrom(result, fallback) {
  const candidate = result?.error?.code ?? result?.code;
  return SAFE_ERROR_CODES.has(candidate) ? candidate : fallback;
}

function publicResult(result) {
  if (!isRecord(result)) return failure("invalid_result");
  if (result.ok === false) return failure(safeCodeFrom(result, "operation_failed"));

  let copy;
  try {
    copy = structuredClone(result);
  } catch {
    return failure("invalid_result");
  }
  for (const key of INTERNAL_RESULT_KEYS) delete copy[key];
  return freezeDeep(copy);
}

function isDirectAppliedReceipt(receipt) {
  if (!isRecord(receipt) || typeof receipt.ok !== "boolean") return false;
  if (Object.hasOwn(receipt, "result") || Object.hasOwn(receipt, "idempotent")) return false;
  if (receipt.ok === false) return true;
  return typeof receipt.committed === "boolean"
    && typeof receipt.replayed === "boolean"
    && Number.isSafeInteger(receipt.revision)
    && receipt.revision >= 0;
}

function resolveCaller(caller) {
  if (!isRecord(caller) || !isNonEmptyString(caller.actorId) || !isNonEmptyString(caller.familyId)) {
    return failure("invalid_caller_context");
  }
  return Object.freeze({ ok: true, actorId: caller.actorId, familyId: caller.familyId });
}

function resolveMembership(state, caller, errorCode) {
  if (!isRecord(state) || !Array.isArray(state.members)) return failure(errorCode);
  if (state.familyId !== undefined && state.familyId !== caller.familyId) return failure(errorCode);
  const member = state.members.find((candidate) => isRecord(candidate)
    && candidate.id === caller.actorId
    && candidate.familyId === caller.familyId);
  return member ? Object.freeze({ ok: true, member }) : failure(errorCode);
}

function safeIdentifier(value) {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value) ? value : null;
}

function commandFingerprint(operation, caller, command) {
  const expectedVersions = {};
  for (const field of EXPECTED_VERSION_FIELDS) {
    expectedVersions[field] = Number.isSafeInteger(command[field]) && command[field] > 0
      ? command[field]
      : null;
  }
  const entityId = operation === "completeTodo" ? command.todoId : command.handoverId;
  return JSON.stringify({
    operation,
    actorId: safeIdentifier(caller.actorId),
    familyId: safeIdentifier(caller.familyId),
    entityId: safeIdentifier(entityId),
    expectedVersions,
  });
}

function assertDependencies(store, ports) {
  const validStore = isRecord(store)
    && typeof store.readSnapshot === "function"
    && typeof store.currentRevision === "function"
    && typeof store.applyResult === "function";
  const validPorts = isRecord(ports) && REQUIRED_PORTS.every((name) => typeof ports[name] === "function");
  if (!validStore || !validPorts) throw new TypeError("Invalid responsibility service dependencies.");
}

/**
 * Creates the server-facing orchestration boundary for the P0 responsibility engine.
 * Ports are pure reducers over a frozen snapshot. `store.applyResult` is the only
 * persistence boundary and returns the applied command result directly with
 * `committed`, `replayed`, and `revision` metadata.
 */
export function createResponsibilityService({ store, ports } = {}) {
  assertDependencies(store, ports);

  async function readSnapshot() {
    try {
      return { ok: true, state: immutableClone(await store.readSnapshot()) };
    } catch {
      return failure("store_unavailable");
    }
  }

  async function suggest(caller, input) {
    const resolved = resolveCaller(caller);
    if (!resolved.ok) return resolved;
    const loaded = await readSnapshot();
    if (!loaded.ok) return loaded;
    const membership = resolveMembership(loaded.state, resolved, "viewer_unauthorized");
    if (!membership.ok) return membership;

    let request;
    try {
      request = immutableClone({ actorId: resolved.actorId, familyId: resolved.familyId, input });
    } catch {
      return failure("invalid_request");
    }

    try {
      const result = await ports.analyzeResponsibility(loaded.state, request);
      return publicResult(result);
    } catch {
      return failure("operation_failed");
    }
  }

  async function view(caller) {
    const resolved = resolveCaller(caller);
    if (!resolved.ok) return resolved;
    const loaded = await readSnapshot();
    if (!loaded.ok) return loaded;
    const membership = resolveMembership(loaded.state, resolved, "viewer_unauthorized");
    if (!membership.ok) return membership;

    try {
      const result = await ports.projectForActor(
        loaded.state,
        Object.freeze({ actorId: resolved.actorId, familyId: resolved.familyId }),
      );
      return publicResult(result);
    } catch {
      return failure("operation_failed");
    }
  }

  async function mutate(operation, port, caller, command) {
    const resolved = resolveCaller(caller);
    if (!resolved.ok) return resolved;
    if (!isRecord(command)) return failure("invalid_request");

    let scopedCommand;
    try {
      scopedCommand = immutableClone({
        ...command,
        actorId: resolved.actorId,
        familyId: resolved.familyId,
      });
    } catch {
      return failure("invalid_request");
    }
    if (!isNonEmptyString(scopedCommand.idempotencyKey)) return failure("invalid_request");

    let expectedRevision;
    try {
      // Reading the revision first makes a concurrent write fail closed at applyResult.
      expectedRevision = await store.currentRevision();
    } catch {
      return failure("store_unavailable");
    }
    const loaded = await readSnapshot();
    if (!loaded.ok) return loaded;
    const membership = resolveMembership(loaded.state, resolved, "permission_denied");
    if (!membership.ok) return membership;

    let commandResult;
    try {
      commandResult = await port(loaded.state, scopedCommand);
    } catch {
      return failure("operation_failed");
    }
    if (!isRecord(commandResult) || typeof commandResult.ok !== "boolean") {
      return failure("invalid_result");
    }

    let applied;
    try {
      applied = await store.applyResult(Object.freeze({
        result: commandResult,
        expectedRevision,
        idempotencyKey: scopedCommand.idempotencyKey,
        fingerprint: commandFingerprint(operation, resolved, scopedCommand),
      }));
    } catch {
      return failure("store_unavailable");
    }
    if (!isDirectAppliedReceipt(applied)) return failure("invalid_result");
    return publicResult(applied);
  }

  return Object.freeze({
    suggest,
    submit: (caller, command) => mutate("submit", ports.submitHandover, caller, command),
    revise: (caller, command) => mutate("revise", ports.reviseHandover, caller, command),
    decline: (caller, command) => mutate("decline", ports.declineHandover, caller, command),
    expire: (caller, command) => mutate("expire", ports.expireHandover, caller, command),
    accept: (caller, command) => mutate("accept", ports.acceptHandover, caller, command),
    completeTodo: (caller, command) => mutate("completeTodo", ports.completeTodo, caller, command),
    view,
  });
}
