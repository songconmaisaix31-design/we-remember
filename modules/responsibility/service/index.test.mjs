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
        return { ok: true, result: prior.result, committed: false, revision, idempotent: true };
      }

      if (request.result.ok === true && request.result.nextState !== undefined) {
        state = prepare(request.result.nextState);
        revision += 1;
        const storedResult = freezeDeep(clone(request.result));
        idempotency.set(request.idempotencyKey, { fingerprint: request.fingerprint, result: storedResult });
        return { ok: true, result: storedResult, committed: true, revision, idempotent: false };
      }
      return { ok: true, result: request.result, committed: false, revision, idempotent: false };
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
    expectedHandoverVersion: 1,
    idempotencyKey: "submit-one",
  });
  assert.equal(store.inspect().state.handoverStatus, "pending_info");
  assert.equal(store.inspect().state.ownerId, "mother");

  const revised = await service.revise(caller, {
    handoverId: "handover-one",
    expectedHandoverVersion: 2,
    idempotencyKey: "revise-one",
  });
  const accepted = await service.accept(
    { actorId: "father", familyId: "family-one" },
    {
      handoverId: "handover-one",
      expectedHandoverVersion: 3,
      expectedDomainVersion: 1,
      idempotencyKey: "accept-one",
    },
  );
  const viewed = await service.view({ actorId: "father", familyId: "family-one" });

  assert.equal(suggestion.status, "suggested");
  assert.deepEqual(
    { code: submitted.code, status: submitted.status, committed: submitted.committed },
    { code: "incomplete", status: "pending_info", committed: true },
  );
  assert.equal(revised.committed, true);
  assert.equal(accepted.committed, true);
  assert.equal("nextState" in accepted, false);
  assert.deepEqual(viewed.projection, { ownerId: "father", viewerId: "father" });
  assert.deepEqual(store.inspect(), {
    state: freezeDeep(responsibilityState({ ownerId: "father", handoverStatus: "accepted" })),
    revision: 4,
  });
  assert.deepEqual(calls.map(({ name }) => name), [
    "store.readSnapshot",
    "port.analyzeResponsibility",
    "store.currentRevision",
    "store.readSnapshot",
    "port.submitHandover",
    "store.applyResult",
    "store.currentRevision",
    "store.readSnapshot",
    "port.reviseHandover",
    "store.applyResult",
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
    expectedHandoverVersion: 2,
    idempotencyKey: "decline-one",
  });
  const expired = await service.expire(caller, {
    handoverId: "handover-one",
    expectedHandoverVersion: 2,
    idempotencyKey: "expire-one",
  });
  const completed = await service.completeTodo(caller, {
    todoId: "todo-one",
    expectedTodoVersion: 1,
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
  assert.equal(completed.error.code, "operation_failed");
  assert.equal(JSON.stringify({ declined, completed }).includes("private"), false);
  assert.deepEqual(store.inspect(), {
    state: freezeDeep(clone(initialState)),
    revision: 1,
  });
  assert.equal(calls.filter(({ name }) => name === "store.applyResult").length, 2);
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

test("caller scope overrides forged command scope and versions and idempotency pass through unchanged", async () => {
  const calls = [];
  const store = createFakeStore(
    responsibilityState({ ownerId: "mother", handoverStatus: "pending_ack" }),
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
        nextState: { ...state, ownerId: command.actorId, handoverStatus: "accepted" },
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
    idempotencyKey: "same-key",
    privateText: "private burden text",
  };

  const first = await service.accept({ actorId: "father", familyId: "family-one" }, command);
  const firstRevision = store.inspect().revision;
  const replay = await service.accept({ actorId: "father", familyId: "family-one" }, command);

  assert.equal(first.idempotent, false);
  assert.equal(replay.idempotent, true);
  assert.equal(store.inspect().revision, firstRevision);
  assert.equal(received.length, 2);
  for (const request of received) {
    assert.equal(request.actorId, "father");
    assert.equal(request.familyId, "family-one");
    assert.equal(request.expectedHandoverVersion, 4);
    assert.equal(request.expectedDomainVersion, 7);
    assert.equal(request.idempotencyKey, "same-key");
    assert.equal(Object.isFrozen(request), true);
  }
  const applyCalls = calls.filter(({ name }) => name === "store.applyResult");
  assert.equal(applyCalls.length, 2);
  assert.equal(applyCalls.every(({ request }) => request.idempotencyKey === "same-key"), true);
  assert.deepEqual(JSON.parse(applyCalls[0].request.fingerprint), {
    operation: "accept",
    actorId: "father",
    familyId: "family-one",
    entityId: "handover-one",
    expectedVersions: {
      expectedVersion: null,
      expectedHandoverVersion: 4,
      expectedDomainVersion: 7,
      expectedTodoVersion: null,
    },
  });
  assert.equal(applyCalls[0].request.fingerprint.includes("forged"), false);
  assert.equal(applyCalls[0].request.fingerprint.includes("private"), false);
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
    { handoverId: "handover-one", expectedHandoverVersion: 1, idempotencyKey: "wrong-family" },
  );

  assert.deepEqual(agentView.projection, { viewerId: "agent" });
  assert.equal(missingView.error.code, "viewer_unauthorized");
  assert.equal(wrongFamilyMutation.error.code, "permission_denied");
  assert.equal(viewCalls, 1);
  assert.equal(submitCalls, 0);
  assert.equal(calls.some(({ name }) => name === "store.applyResult"), false);
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
    expectedHandoverVersion: 1,
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

test("returns stable errors before dependencies can observe invalid caller or request data", async () => {
  const calls = [];
  const store = createFakeStore(responsibilityState({ ownerId: "mother" }), calls);
  const service = createResponsibilityService({ store, ports: createPorts(calls) });

  const invalidCaller = await service.submit(
    { actorId: "mother" },
    { idempotencyKey: "key-one", expectedHandoverVersion: 1 },
  );
  const invalidRequest = await service.submit(caller, { expectedHandoverVersion: 1 });

  assert.equal(invalidCaller.error.code, "invalid_caller_context");
  assert.equal(invalidRequest.error.code, "invalid_request");
  assert.equal(calls.length, 0);
  assert.throws(
    () => createResponsibilityService({ store, ports: {} }),
    { name: "TypeError", message: "Invalid responsibility service dependencies." },
  );
});
