import assert from "node:assert/strict";
import test from "node:test";

import { createResponsibilityStore, STORE_ERROR_CODES } from "./index.mjs";

const applyInput = (result, overrides = {}) => ({
  result,
  expectedRevision: 0,
  idempotencyKey: "command-1",
  fingerprint: "accept-handover:handover-1:domain-v1:handover-v1",
  ...overrides,
});

test("commits a complete successful result atomically", () => {
  const store = createResponsibilityStore({
    domain: { ownerId: "mother", version: 1 },
    reminders: [{ id: "reminder-1", recipientId: "mother" }],
  });

  const current = store.readSnapshot();
  const outcome = store.applyResult(
    applyInput({
      ok: true,
      nextState: {
        ...current,
        domain: { ownerId: "father", version: 2 },
        reminders: [{ id: "reminder-1", recipientId: "father" }],
      },
    }),
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.committed, true);
  assert.equal(outcome.replayed, false);
  assert.equal(outcome.revision, 1);
  assert.equal(store.currentRevision(), 1);
  assert.deepEqual(store.readSnapshot(), {
    domain: { ownerId: "father", version: 2 },
    reminders: [{ id: "reminder-1", recipientId: "father" }],
  });
});

test("rolls back a failed command result", () => {
  const initialState = { count: 1, audit: [] };
  const store = createResponsibilityStore(initialState);

  const outcome = store.applyResult(
    applyInput({
      ok: false,
      error: { code: "not_allowed", message: "The command is not allowed." },
      nextState: { count: 2, audit: ["must-not-commit"] },
    }),
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.committed, false);
  assert.equal(outcome.revision, 0);
  assert.equal(store.currentRevision(), 0);
  assert.deepEqual(store.readSnapshot(), initialState);

  const replay = store.applyResult(
    applyInput({ ok: true, nextState: { count: 2, audit: ["must-not-commit"] } }),
  );
  assert.equal(replay.ok, false);
  assert.equal(replay.replayed, true);
  assert.equal(store.currentRevision(), 0);
  assert.deepEqual(store.readSnapshot(), initialState);
});

test("a thrown command callback leaves the store unchanged", () => {
  const store = createResponsibilityStore({ count: 1 });
  let applyCalled = false;
  const applyCommand = (command) => {
    const result = command(store.readSnapshot());
    applyCalled = true;
    return store.applyResult(applyInput(result));
  };
  const command = () => {
    throw new Error("private command content");
  };

  assert.throws(() => applyCommand(command), Error);
  assert.equal(applyCalled, false);
  assert.equal(store.currentRevision(), 0);
  assert.deepEqual(store.readSnapshot(), { count: 1 });
});

test("returns a stable safe error when reading a result throws", () => {
  const store = createResponsibilityStore({ count: 1 });
  const input = Object.defineProperty(applyInput(null), "result", {
    enumerable: true,
    get() {
      throw new Error("private command content");
    },
  });

  const outcome = store.applyResult(input);

  assert.deepEqual(outcome.error, {
    code: STORE_ERROR_CODES.INVALID_RESULT,
    message: "The command returned an invalid result.",
  });
  assert.equal(JSON.stringify(outcome).includes("private command content"), false);
  assert.equal(store.currentRevision(), 0);
  assert.deepEqual(store.readSnapshot(), { count: 1 });
});

test("does not leak a later throwing result accessor", () => {
  const store = createResponsibilityStore({ count: 1 });
  let reads = 0;
  const result = {
    nextState: { count: 2 },
    get ok() {
      reads += 1;
      if (reads === 1) return true;
      throw new Error("private second-read detail");
    },
  };

  const outcome = store.applyResult(applyInput(result));

  assert.equal(outcome.error.code, STORE_ERROR_CODES.INVALID_RESULT);
  assert.equal(reads, 0);
  assert.equal(JSON.stringify(outcome).includes("private second-read detail"), false);
  assert.equal(store.currentRevision(), 0);
  assert.deepEqual(store.readSnapshot(), { count: 1 });
});

test("rejects snapshot properties that structuredClone would silently drop", () => {
  const store = createResponsibilityStore({ count: 0 });
  const hidden = Symbol("hidden");
  const nextState = { count: 1, [hidden]: "must-not-be-dropped" };
  Object.defineProperty(nextState, "nonEnumerable", {
    value: "must-not-be-dropped",
  });

  const outcome = store.applyResult(applyInput({ ok: true, nextState }));

  assert.equal(outcome.error.code, STORE_ERROR_CODES.INVALID_RESULT);
  assert.equal(store.currentRevision(), 0);
  assert.deepEqual(store.readSnapshot(), { count: 0 });
});

test("fails a reentrant stale apply without overwriting its commit", () => {
  const store = createResponsibilityStore({ count: 0 });
  let reentered = false;
  const outerInput = Object.defineProperty(
    applyInput(null, {
      idempotencyKey: "outer-command",
      fingerprint: "complete-todo:todo-outer:v1",
    }),
    "result",
    {
      enumerable: true,
      get() {
        if (!reentered) {
          reentered = true;
          const inner = store.applyResult(
            applyInput(
              { ok: true, nextState: { count: 1 } },
              {
                idempotencyKey: "inner-command",
                fingerprint: "complete-todo:todo-inner:v1",
              },
            ),
          );
          assert.equal(inner.ok, true);
        }
        return { ok: true, nextState: { count: 2 } };
      },
    },
  );

  const outer = store.applyResult(outerInput);

  assert.equal(outer.error.code, STORE_ERROR_CODES.REVISION_CONFLICT);
  assert.equal(store.currentRevision(), 1);
  assert.deepEqual(store.readSnapshot(), { count: 1 });
});

test("rejects a stale expected revision", () => {
  const store = createResponsibilityStore({ count: 0 });
  store.applyResult(applyInput({ ok: true, nextState: { count: 1 } }));

  const outcome = store.applyResult(
    applyInput(
      { ok: true, nextState: { count: 2 } },
      {
        idempotencyKey: "command-2",
        fingerprint: "complete-todo:todo-1:v1",
      },
    ),
  );

  assert.equal(outcome.error.code, STORE_ERROR_CODES.REVISION_CONFLICT);
  assert.equal(outcome.revision, 1);
  assert.equal(store.currentRevision(), 1);
  assert.deepEqual(store.readSnapshot(), { count: 1 });
});

test("replays an idempotent commit and rejects conflicting key reuse", () => {
  const store = createResponsibilityStore({ count: 0 });
  const firstInput = applyInput({
    ok: true,
    nextState: { count: 1 },
    receipt: { commandId: "command-1" },
  });
  firstInput.privateCommandPayload = "must-not-be-retained";
  const first = store.applyResult(firstInput);

  const replay = store.applyResult({
    ...firstInput,
    result: { ok: true, nextState: { count: 99 } },
  });

  assert.equal(replay.ok, true);
  assert.equal(replay.committed, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.revision, first.revision);
  assert.deepEqual(replay.nextState, first.nextState);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(JSON.stringify(replay).includes("must-not-be-retained"), false);

  const replayWithoutResultRead = store.applyResult(
    Object.defineProperty(
      {
        expectedRevision: 0,
        idempotencyKey: firstInput.idempotencyKey,
        fingerprint: firstInput.fingerprint,
      },
      "result",
      {
        get() {
          throw new Error("a replay must not evaluate a new result");
        },
      },
    ),
  );
  assert.equal(replayWithoutResultRead.replayed, true);

  const conflict = store.applyResult(
    applyInput(
      { ok: true, nextState: { count: 2 } },
      { fingerprint: "accept-handover:handover-2:domain-v1:handover-v1" },
    ),
  );

  assert.equal(conflict.error.code, STORE_ERROR_CODES.IDEMPOTENCY_CONFLICT);
  assert.equal(store.currentRevision(), 1);
  assert.deepEqual(store.readSnapshot(), { count: 1 });
});

test("returns detached deeply frozen snapshots", () => {
  const store = createResponsibilityStore({
    nested: { values: [1, { value: 2 }] },
  });

  const first = store.readSnapshot();
  const second = store.readSnapshot();

  assert.notEqual(first, second);
  assert.notEqual(first.nested, second.nested);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.nested), true);
  assert.equal(Object.isFrozen(first.nested.values), true);
  assert.equal(Object.isFrozen(first.nested.values[1]), true);
  assert.throws(() => first.nested.values.push(3), TypeError);
  assert.deepEqual(store.readSnapshot(), {
    nested: { values: [1, { value: 2 }] },
  });

  const committed = store.applyResult(
    applyInput({
      ok: true,
      nextState: { nested: { values: [3, { value: 4 }] } },
    }),
  );
  const committedSnapshot = store.readSnapshot();
  const replay = store.applyResult(
    applyInput({ ok: true, nextState: { nested: { values: [] } } }),
  );

  assert.equal(Object.isFrozen(committed), true);
  assert.equal(Object.isFrozen(committed.nextState), true);
  assert.equal(Object.isFrozen(committed.nextState.nested.values[1]), true);
  assert.equal(Object.isFrozen(committedSnapshot), true);
  assert.equal(Object.isFrozen(committedSnapshot.nested.values), true);
  assert.equal(Object.isFrozen(replay), true);
  assert.equal(Object.isFrozen(replay.nextState.nested), true);
});

test("does not freeze or retain caller-owned inputs", () => {
  const initialState = { nested: { value: 1 } };
  const store = createResponsibilityStore(initialState);
  initialState.nested.value = 9;
  assert.deepEqual(store.readSnapshot(), { nested: { value: 1 } });

  const nextState = { nested: { value: 2 } };
  const commandResult = { ok: true, nextState };
  const transactionSnapshot = store.readSnapshot();
  assert.equal(Object.isFrozen(transactionSnapshot), true);
  assert.equal(Object.isFrozen(transactionSnapshot.nested), true);
  const outcome = store.applyResult(applyInput(commandResult));

  assert.equal(Object.isFrozen(initialState), false);
  assert.equal(Object.isFrozen(initialState.nested), false);
  assert.equal(Object.isFrozen(nextState), false);
  assert.equal(Object.isFrozen(nextState.nested), false);
  assert.equal(Object.isFrozen(commandResult), false);
  assert.notEqual(outcome.nextState, nextState);

  nextState.nested.value = 10;
  commandResult.nextState = { nested: { value: 11 } };

  assert.deepEqual(store.readSnapshot(), { nested: { value: 2 } });
  assert.deepEqual(outcome.nextState, { nested: { value: 2 } });
});

test("requires a successful result with a complete nextState", () => {
  const store = createResponsibilityStore({ count: 0 });

  const missingState = store.applyResult(applyInput({ ok: true }));
  const asyncResult = store.applyResult(
    applyInput(Promise.resolve({ ok: true, nextState: { count: 1 } })),
  );

  assert.equal(missingState.error.code, STORE_ERROR_CODES.INVALID_RESULT);
  assert.equal(asyncResult.error.code, STORE_ERROR_CODES.INVALID_RESULT);
  assert.equal(store.currentRevision(), 0);
  assert.deepEqual(store.readSnapshot(), { count: 0 });
});

test("exposes only the frozen store interface", () => {
  const store = createResponsibilityStore({ count: 0 });

  assert.deepEqual(Object.keys(store).sort(), ["applyResult", "currentRevision", "readSnapshot"]);
  assert.equal(Object.isFrozen(store), true);
});

test("rejects invalid initial state with a stable safe error", () => {
  const privateMessage = "PRIVATE_INITIAL_SENTINEL";
  const initialState = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error(privateMessage);
      },
    },
  );

  assert.throws(
    () => createResponsibilityStore(initialState),
    (error) =>
      error instanceof TypeError &&
      error.message === "Initial state must be structured-cloneable plain data." &&
      !error.message.includes(privateMessage),
  );
});
