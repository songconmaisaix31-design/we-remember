import assert from "node:assert/strict";
import test from "node:test";

import { createResponsibilityService } from "./index.mjs";

const caller = Object.freeze({ actorId: "mother", familyId: "family-one" });

function freezeDeep(value, seen = new WeakSet()) {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freezeDeep(child, seen);
    Object.freeze(value);
  }
  return value;
}

const clone = (value) => structuredClone(value);

function responsibilityState(overrides = {}) {
  return {
    familyId: "family-one",
    members: [
      { id: "mother", familyId: "family-one", kind: "human" },
      { id: "father", familyId: "family-one", kind: "human" },
      { id: "agent", familyId: "family-one", kind: "agent" },
    ],
    ...overrides,
  };
}

function createFakeStore(initialState, calls, { freezeSnapshots = true } = {}) {
  const prepare = (value) => freezeSnapshots ? freezeDeep(clone(value)) : clone(value);
  let state = prepare(initialState);
  let revision = 1;
  const idempotency = new Map();

  return {
    currentRevision() {
      calls.push({ name: "store.currentRevision" });
      return revision;
    },
    readSnapshot() {
      calls.push({ name: "store.readSnapshot" });
      return state;
    },
    applyResult(request) {
      assert.equal(arguments.length, 1);
      calls.push({ name: "store.applyResult", request });
      if (request.expectedRevision !== revision) {
        return { ok: false, error: { code: "version_conflict", detail: "not public" } };
      }

      const prior = idempotency.get(request.idempotencyKey);
      if (prior) {
        if (prior.fingerprint !== request.fingerprint) {
          return { ok: false, error: { code: "idempotency_conflict" } };
        }
        return {
          ...prior.commandResult,
          committed: false,
          replayed: true,
          revision,
        };
      }

      if (request.result.ok === true) {
        const committed = request.result.nextState !== undefined;
        if (committed) {
          state = prepare(request.result.nextState);
          revision += 1;
        }
        const storedResult = freezeDeep(clone(request.result));
        idempotency.set(request.idempotencyKey, { fingerprint: request.fingerprint, commandResult: storedResult });
        return {
          ...storedResult,
          committed,
          replayed: false,
          revision,
        };
      }
      return {
        ...request.result,
        committed: false,
        replayed: false,
        revision,
      };
    },
    inspect() {
      return { state, revision };
    },
  };
}

function createPorts(calls, overrides = {}) {
  const unused = async () => ({ ok: true });
  return {
    analyzeResponsibility: unused,
    submitHandover: unused,
    reviseHandover: unused,
    declineHandover: unused,
    expireHandover: unused,
    acceptHandover: unused,
    completeTodo: unused,
    projectForActor: unused,
    ...overrides,
  };
}

test("runs the golden lifecycle in order and commits pending_info and accepted snapshots", async () => {
  const calls = [];
  const store = createFakeStore(responsibilityState({ ownerId: "mother", handoverStatus: "draft" }), calls);
  const ports = createPorts(calls, {
    analyzeResponsibility(state, request) {
      calls.push({ name: "port.analyzeResponsibility", state, request });
      return { status: "suggested", suggestion: { proposedOwnerId: "father" } };
    },
    submitHandover(state, command) {
      calls.push({ name: "port.submitHandover", state, command });
      return {
        ok: true,
        code: "incomplete",
        status: "pending_info",
        nextState: { ...state, handoverStatus: "pending_info" },
      };
    },
    reviseHandover(state, command) {
      calls.push({ name: "port.reviseHandover", state, command });
      return {
        ok: true,
        code: "ok",
        status: "pending_ack",
        nextState: { ...state, handoverStatus: "pending_ack" },
      };
    },
    acceptHandover(state, command) {
      calls.push({ name: "port.acceptHandover", state, command });
      return {
        ok: true,
        code: "accepted",
        nextState: { ...state, ownerId: "father", handoverStatus: "accepted" },
      };
    },
    projectForActor(state, request) {
      calls.push({ name: "port.projectForActor", state, request });
      return { ok: true, projection: { ownerId: state.ownerId, viewerId: request.actorId } };
    },
  });
  const service = createResponsibilityService({ store, ports });

  const suggestion = await service.suggest(caller, { text: "Please review a handover." });
  const submitted = await service.submit(caller, {
    handoverId: "handover-one",
    expectedVersion: 1,
    idempotencyKey: "submit-one",
  });
  assert.equal(store.inspect().state.handoverStatus, "pending_info");
  assert.equal(store.inspect().state.ownerId, "mother");

  const revised = await service.revise(caller, {
    handoverId: "handover-one",
    expectedVersion: 2,
    patch: {},
    idempotencyKey: "revise-one",
  });
  const accepted = await service.accept(
    { actorId: "father", familyId: "family-one" },
    {
      handoverId: "handover-one",
      expectedHandoverVersion: 3,
      expectedDomainVersion: 1,
      now: "2030-04-10T00:00:00.000Z",
      idempotencyKey: "accept-one",
    },
  );
  const viewed = await service.view({ actorId: "father", familyId: "family-one" });

  assert.equal(suggestion.status, "suggested");
  assert.deepEqual(
    {
      code: submitted.code,
      status: submitted.status,
      committed: submitted.committed,
      replayed: submitted.replayed,
      revision: submitted.revision,
    },
    { code: "incomplete", status: "pending_info", committed: true, replayed: false, revision: 2 },
  );
  assert.equal(revised.committed, true);
  assert.equal(revised.replayed, false);
  assert.equal(revised.revision, 3);
  assert.equal(accepted.committed, true);
  assert.equal(accepted.replayed, false);
  assert.equal(accepted.revision, 4);
  assert.equal("nextState" in accepted, false);
  assert.equal("result" in accepted, false);
  assert.equal("idempotent" in accepted, false);
  assert.deepEqual(viewed.projection, { ownerId: "father", viewerId: "father" });
  assert.deepEqual(store.inspect(), {
    state: freezeDeep(responsibilityState({ ownerId: "father", handoverStatus: "accepted" })),
    revision: 4,
  });
  assert.deepEqual(calls.map(({ name }) => name), [
    "store.readSnapshot",
    "port.analyzeResponsibility",
    "store.readSnapshot",
    "store.currentRevision",
    "store.readSnapshot",
    "port.submitHandover",
    "store.applyResult",
    "store.readSnapshot",
    "store.currentRevision",
    "store.readSnapshot",
    "port.reviseHandover",
    "store.applyResult",
    "store.readSnapshot",
    "store.currentRevision",
    "store.readSnapshot",
    "port.acceptHandover",
    "store.applyResult",
    "store.readSnapshot",
    "port.projectForActor",
  ]);
});

test("failed and successful no-op results roll back without exposing unsafe errors", async () => {
  const calls = [];
  const initialState = responsibilityState({ ownerId: "mother", handoverStatus: "pending_ack" });
  const store = createFakeStore(initialState, calls);
  const ports = createPorts(calls, {
    declineHandover(state) {
      calls.push({ name: "port.declineHandover" });
      assert.throws(() => {
        state.ownerId = "attacker";
      }, TypeError);
      return {
        ok: false,
        code: "permission_denied",
        message: "private burden text",
        nextState: { ...state, ownerId: "attacker" },
      };
    },
    expireHandover() {
      calls.push({ name: "port.expireHandover" });
      return { ok: true, code: "not_expired" };
    },
    completeTodo() {
      calls.push({ name: "port.completeTodo" });
      throw new Error("private provider response");
    },
  });
  const service = createResponsibilityService({ store, ports });

  const declined = await service.decline(caller, {
    handoverId: "handover-one",
    expectedVersion: 2,
    idempotencyKey: "decline-one",
  });
  const expired = await service.expire(caller, {
    handoverId: "handover-one",
    expectedVersion: 2,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "expire-one",
  });
  const expiredReplay = await service.expire(caller, {
    handoverId: "handover-one",
    expectedVersion: 2,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "expire-one",
  });
  const completed = await service.completeTodo(caller, {
    todoId: "todo-one",
    expectedVersion: 1,
    idempotencyKey: "todo-one",
  });

  assert.deepEqual(declined, {
    ok: false,
    error: {
      code: "permission_denied",
      message: "Responsibility operation could not be completed.",
    },
  });
  assert.deepEqual(
    { ok: expired.ok, code: expired.code, committed: expired.committed },
    { ok: true, code: "not_expired", committed: false },
  );
  assert.deepEqual(
    { ok: expiredReplay.ok, committed: expiredReplay.committed, replayed: expiredReplay.replayed, revision: expiredReplay.revision },
    { ok: true, committed: false, replayed: true, revision: 1 },
  );
  assert.equal(completed.error.code, "operation_failed");
  assert.equal(JSON.stringify({ declined, completed }).includes("private"), false);
  assert.deepEqual(store.inspect(), {
    state: freezeDeep(clone(initialState)),
    revision: 1,
  });
  assert.equal(calls.filter(({ name }) => name === "store.applyResult").length, 3);
});

test("manual_required analysis cannot mutate or replace the stored owner", async () => {
  const calls = [];
  const initialState = responsibilityState({ ownerId: "mother" });
  const store = createFakeStore(initialState, calls, { freezeSnapshots: false });
  const ports = createPorts(calls, {
    analyzeResponsibility(state, request) {
      calls.push({ name: "port.analyzeResponsibility", request });
      assert.equal(Object.isFrozen(state), true);
      assert.throws(() => {
        state.ownerId = "agent";
      }, TypeError);
      return {
        status: "manual_required",
        issueCodes: ["schema_invalid"],
        nextState: { ownerId: "agent" },
      };
    },
  });
  const service = createResponsibilityService({ store, ports });

  const result = await service.suggest(caller, { text: "Unstructured private input" });

  assert.deepEqual(result, { status: "manual_required", issueCodes: ["schema_invalid"] });
  assert.deepEqual(store.inspect(), { state: initialState, revision: 1 });
  assert.equal(calls.some(({ name }) => name === "store.applyResult"), false);
});

test("forwards trusted scope and versions while preserving replay and conflict receipts", async () => {
  const calls = [];
  const store = createFakeStore(
    responsibilityState({ ownerId: "mother", handoverStatus: "pending_ack", effectCount: 0 }),
    calls,
  );
  const received = [];
  const ports = createPorts(calls, {
    acceptHandover(state, command) {
      calls.push({ name: "port.acceptHandover" });
      received.push(command);
      return {
        ok: true,
        code: "accepted",
        nextState: {
          ...state,
          ownerId: command.actorId,
          handoverStatus: "accepted",
          effectCount: state.effectCount + 1,
        },
      };
    },
  });
  const service = createResponsibilityService({ store, ports });
  const command = {
    actorId: "forged-actor",
    familyId: "forged-family",
    handoverId: "handover-one",
    expectedHandoverVersion: 4,
    expectedDomainVersion: 7,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "same-key",
  };

  const first = await service.accept({ actorId: "father", familyId: "family-one" }, command);
  const firstRevision = store.inspect().revision;
  const replay = await service.accept({ actorId: "father", familyId: "family-one" }, command);
  const conflict = await service.accept(
    { actorId: "father", familyId: "family-one" },
    { ...command, expectedDomainVersion: 8 },
  );

  assert.equal(first.committed, true);
  assert.equal(first.replayed, false);
  assert.equal(first.revision, firstRevision);
  assert.equal(replay.committed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.revision, firstRevision);
  assert.equal(store.inspect().revision, firstRevision);
  assert.equal(store.inspect().state.effectCount, 1);
  assert.equal(conflict.error.code, "idempotency_conflict");
  assert.equal(received.length, 3);
  for (const request of received.slice(0, 2)) {
    assert.equal(request.actorId, "father");
    assert.equal(request.familyId, "family-one");
    assert.equal(request.expectedHandoverVersion, 4);
    assert.equal(request.expectedDomainVersion, 7);
    assert.equal(request.idempotencyKey, "same-key");
    assert.equal(Object.isFrozen(request), true);
  }
  const applyCalls = calls.filter(({ name }) => name === "store.applyResult");
  assert.equal(applyCalls.length, 3);
  assert.equal(applyCalls.every(({ request }) => request.idempotencyKey === "same-key"), true);
  assert.match(applyCalls[0].request.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(applyCalls[0].request.fingerprint, applyCalls[1].request.fingerprint);
  assert.equal(applyCalls[0].request.fingerprint.includes("forged"), false);
  assert.notEqual(applyCalls[0].request.fingerprint, applyCalls[2].request.fingerprint);

  const unknownField = await service.accept(
    { actorId: "father", familyId: "family-one" },
    { ...command, idempotencyKey: "unknown-field", privateText: "private burden text" },
  );
  assert.equal(unknownField.error.code, "invalid_request");
  assert.equal(received.length, 3);
});

test("resolves family membership before ports while allowing an Agent member to reach leaf policy", async () => {
  const calls = [];
  const state = responsibilityState({
    ownerId: "mother",
    members: [
      ...responsibilityState().members,
      { id: "visitor", familyId: "family-two", kind: "human" },
    ],
  });
  const store = createFakeStore(state, calls);
  let viewCalls = 0;
  let submitCalls = 0;
  const ports = createPorts(calls, {
    projectForActor(_state, request) {
      viewCalls += 1;
      return { ok: true, projection: { viewerId: request.actorId } };
    },
    submitHandover() {
      submitCalls += 1;
      return { ok: true };
    },
  });
  const service = createResponsibilityService({ store, ports });

  const agentView = await service.view({ actorId: "agent", familyId: "family-one" });
  const missingView = await service.view({ actorId: "missing", familyId: "family-one" });
  const wrongFamilyMutation = await service.submit(
    { actorId: "visitor", familyId: "family-two" },
    { handoverId: "handover-one", expectedVersion: 1, idempotencyKey: "wrong-family" },
  );

  assert.deepEqual(agentView.projection, { viewerId: "agent" });
  assert.equal(missingView.error.code, "viewer_unauthorized");
  assert.equal(wrongFamilyMutation.error.code, "permission_denied");
  assert.equal(viewCalls, 1);
  assert.equal(submitCalls, 0);
  assert.equal(calls.some(({ name }) => name === "store.applyResult"), false);
});

test("preserves the model contract's full bounded identifier charset", async () => {
  const calls = [];
  const store = createFakeStore({
    familyId: "family.one",
    members: [{ id: "mother.v1", familyId: "family.one", kind: "human" }],
  }, calls);
  let received;
  const ports = createPorts(calls, {
    submitHandover(_state, command) {
      received = command;
      return { ok: false, code: "invalid_transition" };
    },
  });
  const service = createResponsibilityService({ store, ports });

  const result = await service.submit(
    { actorId: "mother.v1", familyId: "family.one" },
    { handoverId: "handover.v1", expectedVersion: 1, idempotencyKey: "bounded-id" },
  );

  assert.equal(result.error.code, "invalid_transition");
  assert.equal(received.actorId, "mother.v1");
  assert.equal(received.familyId, "family.one");
  assert.equal(received.handoverId, "handover.v1");
  assert.equal(calls.some(({ name }) => name === "store.applyResult"), true);
});

test("maps unrecognized error codes to one stable non-content failure", async () => {
  const calls = [];
  const store = createFakeStore(responsibilityState({ ownerId: "mother" }), calls);
  const ports = createPorts(calls, {
    submitHandover() {
      return {
        ok: false,
        code: "GrandmotherPrivateBurden",
        message: "private burden text",
      };
    },
  });
  const service = createResponsibilityService({ store, ports });

  const result = await service.submit(caller, {
    handoverId: "handover-one",
    expectedVersion: 1,
    idempotencyKey: "unknown-error",
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "operation_failed",
      message: "Responsibility operation could not be completed.",
    },
  });
  assert.equal(JSON.stringify(result).includes("Burden"), false);
  assert.equal(store.inspect().revision, 1);
});

test("rejects wrapper and legacy store receipts without exposing nested state", async () => {
  const receipts = [
    {
      ok: true,
      result: { ok: true, code: "accepted", nextState: { ownerId: "agent" } },
      committed: true,
      replayed: false,
      revision: 2,
    },
    {
      ok: true,
      code: "accepted",
      nextState: { ownerId: "agent" },
      committed: true,
      idempotent: false,
      revision: 2,
    },
    {
      ok: true,
      code: "accepted",
      nextState: { ownerId: "agent" },
      committed: true,
      replayed: "false",
      revision: 2,
    },
  ];

  for (const receipt of receipts) {
    const calls = [];
    const store = createFakeStore(responsibilityState({ ownerId: "mother" }), calls);
    store.applyResult = () => receipt;
    const ports = createPorts(calls, {
      submitHandover(state) {
        return { ok: true, nextState: { ...state, ownerId: "father" } };
      },
    });
    const service = createResponsibilityService({ store, ports });

    const result = await service.submit(caller, {
      handoverId: "handover-one",
      expectedVersion: 1,
      idempotencyKey: "receipt-shape",
    });

    assert.equal(result.error.code, "invalid_result");
    assert.equal(JSON.stringify(result).includes("agent"), false);
  }
});

test("returns stable errors before dependencies can observe invalid caller or request data", async () => {
  const calls = [];
  const store = createFakeStore(responsibilityState({ ownerId: "mother" }), calls);
  const service = createResponsibilityService({ store, ports: createPorts(calls) });

  const invalidCaller = await service.submit(
    { actorId: "mother" },
    { idempotencyKey: "key-one", expectedVersion: 1 },
  );
  const invalidRequest = await service.submit(caller, { expectedVersion: 1 });

  assert.equal(invalidCaller.error.code, "invalid_caller_context");
  assert.equal(invalidRequest.error.code, "invalid_request");
  assert.equal(calls.length, 0);
  assert.throws(
    () => createResponsibilityService({ store, ports: {} }),
    { name: "TypeError", message: "Invalid responsibility service dependencies." },
  );
});
