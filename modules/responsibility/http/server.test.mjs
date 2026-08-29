import assert from "node:assert/strict";
import test from "node:test";

import { createDemoHttpServer } from "./server.mjs";

const HANDOVER_ID = "handover-grandmother-follow-up-to-father";
const DOMAIN_ID = "domain-grandmother-follow-up";
const DOMAIN_TODO_ID = "todo-confirm-follow-up-logistics";
const FACT_EVIDENCE_ID = "evidence-grandmother-follow-up-fact";
const PRIVATE_EXPRESSION_ID = "evidence-mother-follow-up-burden";
const PRIVATE_REQUEST_ID = "evidence-follow-up-responsibility-request";
const PRIVATE_EXPRESSION = "I feel overwhelmed carrying all of Grandmother's follow-up coordination by myself.";
const PRIVATE_REQUEST = "Please ask Father to take over the follow-up coordination.";

const findById = (items, id) => items.find((item) => item.id === id);

async function startDemo(t) {
  const demo = await createDemoHttpServer({ host: "127.0.0.1", port: 0 });
  t.after(async () => {
    await demo.close();
  });
  return demo;
}

async function requestJson(demo, pathname, { method = "GET", body, rawBody } = {}) {
  const response = await fetch(`${demo.url}${pathname}`, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/u);
  return { response, body: await response.json() };
}

async function postAction(demo, actorId, action, command) {
  return requestJson(demo, "/api/demo/action", {
    method: "POST",
    body: { actorId, action, command },
  });
}

function assertSafeError(body, code) {
  assert.deepEqual(Object.keys(body).sort(), ["error", "ok"]);
  assert.equal(body.ok, false);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
  assert.equal(body.error.code, code);
  assert.equal(body.error.message, "The demo request could not be completed.");
}

test("serves role-safe mother, father, and grandmother projections", async (t) => {
  const demo = await startDemo(t);
  const views = {};

  for (const actorId of ["mother", "father", "grandmother"]) {
    const { response, body } = await requestJson(
      demo,
      `/api/demo/state?actor=${actorId}`,
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mode, "demo_in_memory");
    assert.equal(body.revision, 0);
    assert.equal(body.actorId, actorId);
    assert.equal(body.projection.viewer.id, actorId);
    views[actorId] = body.projection;
  }

  assert.deepEqual(
    views.mother.privateEvidence.map((item) => item.id).sort(),
    [FACT_EVIDENCE_ID, PRIVATE_EXPRESSION_ID, PRIVATE_REQUEST_ID].sort(),
  );
  assert.deepEqual(views.father.privateEvidence, []);
  assert.deepEqual(
    views.grandmother.privateEvidence.map((item) => item.id),
    [FACT_EVIDENCE_ID],
  );
  for (const actorId of ["mother", "father", "grandmother"]) {
    assert.deepEqual(
      views[actorId].familyEvidence.map((item) => item.id),
      [FACT_EVIDENCE_ID],
    );
  }

  for (const projection of [views.father, views.grandmother]) {
    const serialized = JSON.stringify(projection);
    assert.equal(serialized.includes(PRIVATE_EXPRESSION_ID), false);
    assert.equal(serialized.includes(PRIVATE_REQUEST_ID), false);
    assert.equal(serialized.includes(PRIVATE_EXPRESSION), false);
    assert.equal(serialized.includes(PRIVATE_REQUEST), false);
  }
});

test("analyzes a responsibility message without mutating demo state", async (t) => {
  const demo = await startDemo(t);
  const { response, body } = await requestJson(demo, "/api/demo/analyze", {
    method: "POST",
    body: {
      actorId: "mother",
      text: "Please suggest a safe responsibility handover.",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.actorId, "mother");
  assert.equal(body.revision, 0);
  assert.equal(body.suggestion.status, "suggested");
  assert.equal(body.suggestion.attempts, 1);
  assert.equal(body.suggestion.suggestion.proposedOwnerId, "father");
  assert.equal(findById(body.projection.domains, DOMAIN_ID).accountableOwnerId, "mother");
});

test("runs handover migration, completes its Todo, and resets the fixture", async (t) => {
  const demo = await startDemo(t);

  const submitted = await postAction(demo, "mother", "submit", {
    handoverId: HANDOVER_ID,
    expectedVersion: 1,
    idempotencyKey: "http-submit-v1",
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.result.code, "incomplete");
  assert.equal(submitted.body.revision, 1);
  assert.equal(findById(submitted.body.projection.handovers, HANDOVER_ID).status, "pending_info");
  assert.equal(findById(submitted.body.projection.domains, DOMAIN_ID).accountableOwnerId, "mother");

  const revised = await postAction(demo, "mother", "revise", {
    handoverId: HANDOVER_ID,
    expectedVersion: 2,
    patch: {
      missingFields: [],
      expiresAt: "2030-04-20T00:00:00.000Z",
    },
    idempotencyKey: "http-revise-v2",
  });
  assert.equal(revised.response.status, 200);
  assert.equal(revised.body.revision, 2);
  assert.equal(findById(revised.body.projection.handovers, HANDOVER_ID).status, "pending_ack");
  assert.equal(findById(revised.body.projection.domains, DOMAIN_ID).accountableOwnerId, "mother");

  const fatherPending = await requestJson(demo, "/api/demo/state?actor=father");
  assert.equal(
    fatherPending.body.projection.reminders.find((item) => item.sourceId === HANDOVER_ID).status,
    "pending",
  );

  const accepted = await postAction(demo, "father", "accept", {
    handoverId: HANDOVER_ID,
    expectedHandoverVersion: 3,
    expectedDomainVersion: 1,
    now: "2030-04-10T00:00:00.000Z",
    idempotencyKey: "http-accept-v3",
  });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.body.result.code, "accepted");
  assert.equal(accepted.body.revision, 3);
  assert.equal(findById(accepted.body.projection.domains, DOMAIN_ID).accountableOwnerId, "father");
  assert.equal(findById(accepted.body.projection.handovers, HANDOVER_ID).status, "accepted");
  assert.equal(findById(accepted.body.projection.todos, DOMAIN_TODO_ID).assigneeId, "father");
  assert.equal(
    accepted.body.projection.reminders.find((item) => item.sourceId === DOMAIN_TODO_ID).recipientId,
    "father",
  );
  assert.equal(
    accepted.body.projection.reminders.find((item) => item.sourceId === HANDOVER_ID).status,
    "completed",
  );

  const motherAfterAcceptance = await requestJson(demo, "/api/demo/state?actor=mother");
  assert.equal(motherAfterAcceptance.body.projection.notices.length, 1);
  assert.equal(motherAfterAcceptance.body.projection.notices[0].recipientId, "mother");

  const completed = await postAction(demo, "father", "completeTodo", {
    todoId: DOMAIN_TODO_ID,
    expectedVersion: 2,
    idempotencyKey: "http-complete-todo-v2",
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.revision, 4);
  assert.equal(findById(completed.body.projection.todos, DOMAIN_TODO_ID).status, "completed");
  assert.equal(
    completed.body.projection.reminders.find((item) => item.sourceId === DOMAIN_TODO_ID).status,
    "cancelled",
  );

  const reset = await requestJson(demo, "/api/demo/reset", {
    method: "POST",
    body: { actorId: "mother" },
  });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.revision, 0);
  assert.equal(findById(reset.body.projection.domains, DOMAIN_ID).accountableOwnerId, "mother");
  assert.equal(findById(reset.body.projection.handovers, HANDOVER_ID).status, "draft");
  assert.equal(findById(reset.body.projection.todos, DOMAIN_TODO_ID).assigneeId, "mother");
  assert.equal(findById(reset.body.projection.todos, DOMAIN_TODO_ID).status, "open");
  assert.deepEqual(reset.body.projection.notices, []);
  assert.deepEqual(reset.body.projection.audit, []);
});

test("returns bounded JSON errors for invalid methods, paths, and oversized bodies", async (t) => {
  const demo = await startDemo(t);

  const invalidMethod = await requestJson(demo, "/api/demo/analyze");
  assert.equal(invalidMethod.response.status, 405);
  assert.equal(invalidMethod.response.headers.get("allow"), "POST");
  assertSafeError(invalidMethod.body, "method_not_allowed");

  const missingPath = await requestJson(demo, "/api/demo/missing");
  assert.equal(missingPath.response.status, 404);
  assertSafeError(missingPath.body, "not_found");

  const oversized = await requestJson(demo, "/api/demo/analyze", {
    method: "POST",
    body: { actorId: "mother", text: "x".repeat(16 * 1024) },
  });
  assert.equal(oversized.response.status, 413);
  assertSafeError(oversized.body, "request_too_large");
});
