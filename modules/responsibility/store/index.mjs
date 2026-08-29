const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_FINGERPRINT_LENGTH = 1_024;

export const STORE_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  REVISION_CONFLICT: "revision_conflict",
  IDEMPOTENCY_CONFLICT: "idempotency_conflict",
  INVALID_RESULT: "invalid_result",
});

const ERROR_MESSAGES = Object.freeze({
  [STORE_ERROR_CODES.INVALID_INPUT]: "Store input is invalid.",
  [STORE_ERROR_CODES.REVISION_CONFLICT]: "The snapshot revision has changed.",
  [STORE_ERROR_CODES.IDEMPOTENCY_CONFLICT]:
    "The idempotency key was already used for another request.",
  [STORE_ERROR_CODES.INVALID_RESULT]: "The command returned an invalid result.",
});

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isPlainDataObject(value) {
  if (Array.isArray(value)) {
    return true;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isArrayIndex(key) {
  if (typeof key !== "string" || key === "") {
    return false;
  }

  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
}

function assertPlainDataShape(value, seen = new WeakSet()) {
  if (!isObject(value) || seen.has(value)) {
    return;
  }

  if (!isPlainDataObject(value)) {
    throw new TypeError("Values must contain only arrays and plain objects.");
  }

  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      (Array.isArray(value) && !isArrayIndex(key)) ||
      !descriptor?.enumerable ||
      !Object.hasOwn(descriptor, "value")
    ) {
      throw new TypeError("Values must use enumerable string-keyed data properties.");
    }

    assertPlainDataShape(descriptor.value, seen);
  }
}

function deepFreezePlainData(value, seen = new WeakSet()) {
  if (!isObject(value) || seen.has(value)) {
    return value;
  }

  if (!isPlainDataObject(value)) {
    throw new TypeError("Snapshot values must contain only arrays and plain objects.");
  }

  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreezePlainData(value[key], seen);
  }

  return Object.freeze(value);
}

function cloneAndFreeze(value) {
  assertPlainDataShape(value);
  return deepFreezePlainData(structuredClone(value));
}

function isSnapshot(value) {
  return isObject(value) && isPlainDataObject(value);
}

function isValidApplyInput(input) {
  return (
    isObject(input) &&
    Number.isSafeInteger(input.expectedRevision) &&
    input.expectedRevision >= 0 &&
    typeof input.idempotencyKey === "string" &&
    input.idempotencyKey.trim().length > 0 &&
    input.idempotencyKey.length <= MAX_IDEMPOTENCY_KEY_LENGTH &&
    typeof input.fingerprint === "string" &&
    input.fingerprint.trim().length > 0 &&
    input.fingerprint.length <= MAX_FINGERPRINT_LENGTH
  );
}

/**
 * Creates a synchronous, in-memory commit boundary for plain-data snapshots.
 * Callers provide a privacy-safe fingerprint made only from command, entity, and
 * version identifiers. The store retains that fingerprint, never a command payload.
 * Domain authorization and transition policy stay outside this generic store.
 *
 * @param {object | Array<unknown>} initialState
 */
export function createResponsibilityStore(initialState) {
  let snapshot;
  try {
    if (!isSnapshot(initialState)) {
      throw new TypeError();
    }
    snapshot = cloneAndFreeze(initialState);
  } catch {
    throw new TypeError("Initial state must be structured-cloneable plain data.");
  }

  let revision = 0;
  const receipts = new Map();

  const readSnapshot = () => cloneAndFreeze(snapshot);
  const currentRevision = () => revision;

  const storeError = (code) =>
    cloneAndFreeze({
      ok: false,
      committed: false,
      replayed: false,
      revision,
      error: {
        code,
        message: ERROR_MESSAGES[code],
      },
    });

  const publicCommandResult = (commandResult, metadata) => {
    const result = structuredClone(commandResult);
    Object.assign(result, metadata);
    return deepFreezePlainData(result);
  };

  const replayReceipt = (idempotencyKey, fingerprint) => {
    const existingReceipt = receipts.get(idempotencyKey);
    if (!existingReceipt) {
      return null;
    }

    if (existingReceipt.fingerprint !== fingerprint) {
      return storeError(STORE_ERROR_CODES.IDEMPOTENCY_CONFLICT);
    }

    const replay = structuredClone(existingReceipt.result);
    replay.replayed = true;
    return deepFreezePlainData(replay);
  };

  /**
   * Atomically replaces the committed state only for `{ ok: true, nextState }`.
   * The result must already be privacy-safe and must not echo raw command input.
   *
   * @param {{ result: object, expectedRevision: number, idempotencyKey: string, fingerprint: string }} input
   */
  const applyResult = (input) => {
    let result;
    let expectedRevision;
    let idempotencyKey;
    let fingerprint;
    try {
      if (!isObject(input)) {
        return storeError(STORE_ERROR_CODES.INVALID_INPUT);
      }

      const candidate = {
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
      };
      if (!isValidApplyInput(candidate)) {
        return storeError(STORE_ERROR_CODES.INVALID_INPUT);
      }

      ({ expectedRevision, idempotencyKey, fingerprint } = candidate);
    } catch {
      return storeError(STORE_ERROR_CODES.INVALID_INPUT);
    }

    const replay = replayReceipt(idempotencyKey, fingerprint);
    if (replay) {
      return replay;
    }

    if (expectedRevision !== revision) {
      return storeError(STORE_ERROR_CODES.REVISION_CONFLICT);
    }

    let normalizedResult;
    try {
      result = input.result;
      normalizedResult = cloneAndFreeze(result);
      if (
        !isObject(normalizedResult) ||
        Array.isArray(normalizedResult) ||
        !isPlainDataObject(normalizedResult) ||
        typeof normalizedResult.ok !== "boolean"
      ) {
        return storeError(STORE_ERROR_CODES.INVALID_RESULT);
      }
    } catch {
      return storeError(STORE_ERROR_CODES.INVALID_RESULT);
    }

    if (!normalizedResult.ok) {
      try {
        const failedResult = publicCommandResult(normalizedResult, {
          committed: false,
          replayed: false,
          revision,
        });

        const interveningReplay = replayReceipt(idempotencyKey, fingerprint);
        if (interveningReplay) {
          return interveningReplay;
        }
        if (expectedRevision !== revision) {
          return storeError(STORE_ERROR_CODES.REVISION_CONFLICT);
        }

        receipts.set(idempotencyKey, {
          fingerprint,
          result: failedResult,
        });
        return cloneAndFreeze(failedResult);
      } catch {
        return storeError(STORE_ERROR_CODES.INVALID_RESULT);
      }
    }

    if (!Object.hasOwn(normalizedResult, "nextState") || !isSnapshot(normalizedResult.nextState)) {
      return storeError(STORE_ERROR_CODES.INVALID_RESULT);
    }

    const nextRevision = revision + 1;
    let nextSnapshot;
    let receiptResult;
    try {
      nextSnapshot = cloneAndFreeze(normalizedResult.nextState);
      receiptResult = publicCommandResult(normalizedResult, {
        nextState: cloneAndFreeze(nextSnapshot),
        committed: true,
        replayed: false,
        revision: nextRevision,
      });
    } catch {
      return storeError(STORE_ERROR_CODES.INVALID_RESULT);
    }

    const interveningReplay = replayReceipt(idempotencyKey, fingerprint);
    if (interveningReplay) {
      return interveningReplay;
    }
    if (expectedRevision !== revision) {
      return storeError(STORE_ERROR_CODES.REVISION_CONFLICT);
    }

    receipts.set(idempotencyKey, {
      fingerprint,
      result: receiptResult,
    });
    snapshot = nextSnapshot;
    revision = nextRevision;

    return cloneAndFreeze(receiptResult);
  };

  return Object.freeze({
    readSnapshot,
    currentRevision,
    applyResult,
  });
}
