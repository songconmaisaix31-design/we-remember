import { createHash } from "node:crypto";

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
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_ARRAY_LENGTH = 256;
const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const INTERNAL_RESULT_KEYS = new Set(["nextState", "state", "snapshot", "error"]);
const REVISE_PATCH_FIELDS = new Set(["proposedOwnerId", "expiresAt", "missingFields"]);
const TRUSTED_OVERRIDE_FIELDS = new Set(["actorId", "familyId"]);
const COMMAND_FIELDS = Object.freeze({
  submit: Object.freeze(["handoverId", "expectedVersion", "idempotencyKey"]),
  revise: Object.freeze(["handoverId", "expectedVersion", "patch", "idempotencyKey"]),
  decline: Object.freeze(["handoverId", "expectedVersion", "idempotencyKey"]),
  expire: Object.freeze(["handoverId", "expectedVersion", "now", "idempotencyKey"]),
  accept: Object.freeze([
    "handoverId",
    "expectedHandoverVersion",
    "expectedDomainVersion",
    "now",
    "idempotencyKey",
  ]),
  completeTodo: Object.freeze(["todoId", "expectedVersion", "idempotencyKey"]),
});

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isPositiveVersion = (value) => Number.isSafeInteger(value) && value > 0;

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
  if (!isRecord(caller) || !isIdentifier(caller.actorId) || !isIdentifier(caller.familyId)) {
    return failure("invalid_caller_context");
  }
  return Object.freeze({ ok: true, actorId: caller.actorId, familyId: caller.familyId });
}

function resolveMembership(state, caller, errorCode) {
  if (!isRecord(state) || !Array.isArray(state.members)) return failure(errorCode);
  if (state.familyId !== undefined && state.familyId !== caller.familyId) return failure(errorCode);
  const matches = state.members.filter((candidate) => isRecord(candidate)
    && candidate.id === caller.actorId);
  if (matches.length !== 1) return failure(errorCode);
  const [member] = matches;
  if (member.familyId !== caller.familyId
    || (member.status !== undefined && member.status !== "active")) {
    return failure(errorCode);
  }
  return Object.freeze({ ok: true, member });
}

function isIdentifier(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function isPlainRecord(value) {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasClosedDataProperties(value, allowedFields, requiredFields = allowedFields) {
  if (!isPlainRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowedFields.has(key))) return false;
  if ([...requiredFields].some((key) => !Object.hasOwn(value, key))) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value");
  });
}

function isDenseUniqueFieldList(value) {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_LENGTH
    || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, "value")) return false;
  }
  return value.every((field) => typeof field === "string" && SAFE_FIELD_NAME.test(field))
    && new Set(value).size === value.length;
}

function isRealIsoInstant(value) {
  if (typeof value !== "string") return false;
  const match = ISO_INSTANT.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[11]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12
    && day >= 1 && day <= monthDays[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59
    && offsetHour <= 14 && offsetMinute <= 59
    && (offsetHour < 14 || offsetMinute === 0)
    && Number.isFinite(Date.parse(value));
}

function isValidIdempotencyKey(value) {
  return isNonEmptyString(value) && value.length <= MAX_IDEMPOTENCY_KEY_LENGTH;
}

function isValidRevisionPatch(patch) {
  if (!hasClosedDataProperties(patch, REVISE_PATCH_FIELDS, [])) return false;
  if (Object.hasOwn(patch, "proposedOwnerId") && !isIdentifier(patch.proposedOwnerId)) return false;
  if (Object.hasOwn(patch, "expiresAt")
    && patch.expiresAt !== null
    && !isRealIsoInstant(patch.expiresAt)) return false;
  return !Object.hasOwn(patch, "missingFields") || isDenseUniqueFieldList(patch.missingFields);
}

function validCommandFields(operation, command) {
  if (!isIdentifier(command.handoverId ?? command.todoId)
    || !isValidIdempotencyKey(command.idempotencyKey)) return false;
  if (operation === "accept") {
    return isPositiveVersion(command.expectedHandoverVersion)
      && isPositiveVersion(command.expectedDomainVersion)
      && isRealIsoInstant(command.now);
  }
  if (!isPositiveVersion(command.expectedVersion)) return false;
  if (operation === "revise") return isValidRevisionPatch(command.patch);
  if (operation === "expire") return isRealIsoInstant(command.now);
  return true;
}

function normalizeCommand(operation, caller, command) {
  const fields = COMMAND_FIELDS[operation];
  if (!fields) return null;
  const allowedFields = new Set([...fields, ...TRUSTED_OVERRIDE_FIELDS]);
  if (!hasClosedDataProperties(command, allowedFields, fields)
    || !validCommandFields(operation, command)) return null;
  const closedCommand = Object.fromEntries(fields.map((field) => [field, command[field]]));
  return immutableClone({
    ...closedCommand,
    actorId: caller.actorId,
    familyId: caller.familyId,
  });
}

function stableSerialize(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(",")}}`;
  }
  if (["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  return JSON.stringify({ unsupportedType: typeof value });
}

function commandFingerprint(operation, command) {
  const fields = Object.fromEntries(
    Object.entries(command).filter(([key]) => key !== "idempotencyKey"),
  );
  const closedPayload = {
    operation,
    fields,
  };
  const digest = createHash("sha256").update(stableSerialize(closedPayload)).digest("hex");
  return `sha256:${digest}`;
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

    let scopedCommand;
    try {
      scopedCommand = normalizeCommand(operation, resolved, command);
    } catch {
      return failure("invalid_request");
    }
    if (!scopedCommand) return failure("invalid_request");

    // Resolve membership before calling a mutation port or touching revision/apply state.
    const membershipProbe = await readSnapshot();
    if (!membershipProbe.ok) return membershipProbe;
    const initialMembership = resolveMembership(membershipProbe.state, resolved, "permission_denied");
    if (!initialMembership.ok) return initialMembership;

    let expectedRevision;
    try {
      // Reading the revision first makes a concurrent write fail closed at applyResult.
      expectedRevision = await store.currentRevision();
    } catch {
      return failure("store_unavailable");
    }
    const loaded = await readSnapshot();
    if (!loaded.ok) return loaded;
    // Recheck after reading the revision so a concurrent membership change fails closed.
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
        fingerprint: commandFingerprint(operation, scopedCommand),
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
