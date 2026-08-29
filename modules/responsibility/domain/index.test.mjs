import assert from "node:assert/strict";
import test from "node:test";

import {
  DOMAIN_COMMAND_ERROR_CODES,
  createResponsibilityDomain,
  linkEventToDomain,
  linkTodoToDomain,
  setDomainNextAction,
  updateResponsibilityScope,
} from "./index.mjs";

const familyId = "family-1";
const members = [
  { id: "mother", familyId, displayName: "Mother", kind: "human", version: 1 },
  { id: "father", familyId, displayName: "Father", kind: "human", version: 1 },
  { id: "helper", familyId, displayName: "Helper", kind: "agent", version: 1 },
  { id: "outside", familyId: "family-2", displayName: "Outside", kind: "human", version: 1 },
];

const domain = {
  id: "grandmother-care",
  familyId,
  title: "Grandmother care",
  accountableOwnerId: "mother",
  status: "active",
  scopeIncluded: ["appointments"],
  scopeExcluded: ["finances"],
  nextActionId: null,
  visibility: "family",
  evidenceIds: [],
  version: 2,
};

const event = {
  id: "event-1",
  familyId,
  title: "Follow-up visit",
  startsAt: "2026-09-01T09:00:00+08:00",
  participantIds: ["grandmother"],
  supportMemberIds: ["mother"],
  informedMemberIds: ["father"],
  domainId: null,
};

const todo = {
  id: "todo-1",
  familyId,
  title: "Book the follow-up visit",
  domainId: null,
  assigneeId: "father",
  assignmentBasis: "explicit",
  dueAt: "2026-08-31T18:00:00+08:00",
  status: "open",
  version: 3,
};

function freezeDeep(value) {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

const snapshot = (value) => JSON.parse(JSON.stringify(value));

function expectCode(result, code) {
  assert.deepEqual(result, {
    ok: false,
    error: {
      code,
      message: "Responsibility domain command could not be completed.",
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.error), true);
}

test("returns one safe fixed error for malformed command envelopes", () => {
  for (const command of [null, [], "invalid", 1]) {
    for (const operation of [
      createResponsibilityDomain,
      updateResponsibilityScope,
      linkEventToDomain,
      linkTodoToDomain,
      setDomainNextAction,
    ]) {
      expectCode(operation(command), DOMAIN_COMMAND_ERROR_CODES.INVALID_INPUT);
    }
  }
});

test("creates an immutable domain with exactly one human accountable owner", () => {
  const input = freezeDeep(snapshot(domain));
  const memberInput = freezeDeep(snapshot(members));
  const before = snapshot({ input, memberInput });

  const result = createResponsibilityDomain({ domain: input, members: memberInput });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, domain);
  assert.notEqual(result.value, input);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.scopeIncluded), true);
  assert.deepEqual({ input, memberInput }, before);
});

test("rejects agent, cross-family, missing, and duplicate accountable owners", () => {
  expectCode(
    createResponsibilityDomain({ domain: { ...domain, accountableOwnerId: "helper" }, members }),
    DOMAIN_COMMAND_ERROR_CODES.OWNER_NOT_HUMAN,
  );
  expectCode(
    createResponsibilityDomain({ domain: { ...domain, accountableOwnerId: "outside" }, members }),
    DOMAIN_COMMAND_ERROR_CODES.FAMILY_MISMATCH,
  );
  expectCode(
    createResponsibilityDomain({ domain: { ...domain, accountableOwnerId: "unknown" }, members }),
    DOMAIN_COMMAND_ERROR_CODES.OWNER_NOT_FOUND,
  );
  expectCode(
    createResponsibilityDomain({
      domain,
      members: [...members, { ...members[0] }],
    }),
    DOMAIN_COMMAND_ERROR_CODES.OWNER_NOT_UNIQUE,
  );
});

test("updates only scope and the domain version without mutating inputs", () => {
  const input = freezeDeep(snapshot(domain));
  const memberInput = freezeDeep(snapshot(members));
  const included = freezeDeep(["appointments", "medication pickup"]);
  const excluded = freezeDeep(["clinical decisions"]);
  const before = snapshot({ input, memberInput, included, excluded });

  const result = updateResponsibilityScope({
    domain: input,
    members: memberInput,
    expectedDomainVersion: 2,
    scopeIncluded: included,
    scopeExcluded: excluded,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    ...domain,
    scopeIncluded: included,
    scopeExcluded: excluded,
    version: 3,
  });
  assert.deepEqual({ input, memberInput, included, excluded }, before);
  assert.notEqual(result.value.scopeIncluded, included);
});

test("rejects stale and non-positive domain versions", () => {
  expectCode(
    updateResponsibilityScope({
      domain,
      members,
      expectedDomainVersion: 1,
      scopeIncluded: [],
      scopeExcluded: [],
    }),
    DOMAIN_COMMAND_ERROR_CODES.VERSION_CONFLICT,
  );
  expectCode(
    updateResponsibilityScope({
      domain,
      members,
      expectedDomainVersion: 0,
      scopeIncluded: [],
      scopeExcluded: [],
    }),
    DOMAIN_COMMAND_ERROR_CODES.INVALID_VERSION,
  );
  expectCode(
    createResponsibilityDomain({ domain: { ...domain, version: 0 }, members }),
    DOMAIN_COMMAND_ERROR_CODES.INVALID_VERSION,
  );
});

test("links an event by changing only domainId and never copies an owner field", () => {
  const input = freezeDeep(snapshot(event));
  const before = snapshot(input);

  const result = linkEventToDomain({
    event: input,
    domain,
    members,
    expectedDomainVersion: 2,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { ...event, domainId: domain.id });
  assert.deepEqual(input, before);
  assert.equal("accountableOwnerId" in result.value, false);
  const changedKeys = Object.keys(result.value).filter((key) => {
    return JSON.stringify(result.value[key]) !== JSON.stringify(event[key]);
  });
  assert.deepEqual(changedKeys, ["domainId"]);
});

test("rejects cross-family events, owner duplication, and stale target domains", () => {
  expectCode(
    linkEventToDomain({
      event: { ...event, familyId: "family-2" },
      domain,
      members,
      expectedDomainVersion: 2,
    }),
    DOMAIN_COMMAND_ERROR_CODES.FAMILY_MISMATCH,
  );
  expectCode(
    linkEventToDomain({
      event: { ...event, accountableOwnerId: "mother" },
      domain,
      members,
      expectedDomainVersion: 2,
    }),
    DOMAIN_COMMAND_ERROR_CODES.EVENT_OWNER_FIELD_FORBIDDEN,
  );
  expectCode(
    linkEventToDomain({ event, domain, members, expectedDomainVersion: 1 }),
    DOMAIN_COMMAND_ERROR_CODES.VERSION_CONFLICT,
  );
});

test("domain-owner todo inherits the current owner and increments its version", () => {
  const input = freezeDeep({ ...todo, assigneeId: "father", assignmentBasis: "domain_owner" });
  const before = snapshot(input);

  const result = linkTodoToDomain({
    todo: input,
    domain,
    members,
    expectedDomainVersion: 2,
    expectedTodoVersion: 3,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.domainId, domain.id);
  assert.equal(result.value.assigneeId, "mother");
  assert.equal(result.value.assignmentBasis, "domain_owner");
  assert.equal(result.value.version, 4);
  assert.deepEqual(input, before);
});

test("explicit todo retains its supplied same-family human assignee", () => {
  const result = linkTodoToDomain({
    todo,
    domain,
    members,
    expectedDomainVersion: 2,
    expectedTodoVersion: 3,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.assigneeId, "father");
  assert.equal(result.value.assignmentBasis, "explicit");
  assert.equal(result.value.domainId, domain.id);
});

test("explicit todo retains its supplied same-family agent assignee", () => {
  const result = linkTodoToDomain({
    todo: { ...todo, assigneeId: "helper" },
    domain,
    members,
    expectedDomainVersion: 2,
    expectedTodoVersion: 3,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.assigneeId, "helper");
  assert.equal(result.value.assignmentBasis, "explicit");
  assert.equal(result.value.domainId, domain.id);
});

test("rejects cross-family, missing, and duplicate explicit assignees", () => {
  expectCode(
    linkTodoToDomain({
      todo: { ...todo, assigneeId: "outside" },
      domain,
      members,
      expectedDomainVersion: 2,
      expectedTodoVersion: 3,
    }),
    DOMAIN_COMMAND_ERROR_CODES.FAMILY_MISMATCH,
  );
  expectCode(
    linkTodoToDomain({
      todo: { ...todo, assigneeId: "unknown" },
      domain,
      members,
      expectedDomainVersion: 2,
      expectedTodoVersion: 3,
    }),
    DOMAIN_COMMAND_ERROR_CODES.ASSIGNEE_NOT_FOUND,
  );
  expectCode(
    linkTodoToDomain({
      todo: { ...todo, assigneeId: "helper" },
      domain,
      members: [...members, { ...members[2] }],
      expectedDomainVersion: 2,
      expectedTodoVersion: 3,
    }),
    DOMAIN_COMMAND_ERROR_CODES.ASSIGNEE_NOT_UNIQUE,
  );
});

test("rejects stale todo and domain versions while linking", () => {
  expectCode(
    linkTodoToDomain({
      todo,
      domain,
      members,
      expectedDomainVersion: 1,
      expectedTodoVersion: 3,
    }),
    DOMAIN_COMMAND_ERROR_CODES.VERSION_CONFLICT,
  );
  expectCode(
    linkTodoToDomain({
      todo,
      domain,
      members,
      expectedDomainVersion: 2,
      expectedTodoVersion: 2,
    }),
    DOMAIN_COMMAND_ERROR_CODES.VERSION_CONFLICT,
  );
});

test("sets an open same-domain todo as the next action immutably", () => {
  const linkedTodo = freezeDeep({ ...todo, domainId: domain.id });
  const domainInput = freezeDeep(snapshot(domain));
  const before = snapshot({ linkedTodo, domainInput });

  const result = setDomainNextAction({
    domain: domainInput,
    todo: linkedTodo,
    members,
    expectedDomainVersion: 2,
    expectedTodoVersion: 3,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.nextActionId, todo.id);
  assert.equal(result.value.version, 3);
  assert.deepEqual({ linkedTodo, domainInput }, before);
});

test("sets an open explicit agent todo as the next action without changing the human owner", () => {
  const result = setDomainNextAction({
    domain,
    todo: { ...todo, domainId: domain.id, assigneeId: "helper" },
    members,
    expectedDomainVersion: 2,
    expectedTodoVersion: 3,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.nextActionId, todo.id);
  assert.equal(result.value.accountableOwnerId, "mother");
  assert.equal(result.value.version, 3);
});

test("rejects closed, cross-family, other-domain, and stale next actions", () => {
  const linkedTodo = { ...todo, domainId: domain.id };
  expectCode(
    setDomainNextAction({
      domain,
      todo: { ...linkedTodo, status: "completed" },
      members,
      expectedDomainVersion: 2,
      expectedTodoVersion: 3,
    }),
    DOMAIN_COMMAND_ERROR_CODES.TODO_NOT_OPEN,
  );
  expectCode(
    setDomainNextAction({
      domain,
      todo: { ...linkedTodo, familyId: "family-2" },
      members,
      expectedDomainVersion: 2,
      expectedTodoVersion: 3,
    }),
    DOMAIN_COMMAND_ERROR_CODES.FAMILY_MISMATCH,
  );
  expectCode(
    setDomainNextAction({
      domain,
      todo: { ...linkedTodo, domainId: "other-domain" },
      members,
      expectedDomainVersion: 2,
      expectedTodoVersion: 3,
    }),
    DOMAIN_COMMAND_ERROR_CODES.TODO_NOT_IN_DOMAIN,
  );
  expectCode(
    setDomainNextAction({
      domain,
      todo: linkedTodo,
      members,
      expectedDomainVersion: 2,
      expectedTodoVersion: 2,
    }),
    DOMAIN_COMMAND_ERROR_CODES.VERSION_CONFLICT,
  );
});

test("rejects a stale domain-owner assignment as a next action", () => {
  expectCode(
    setDomainNextAction({
      domain,
      todo: {
        ...todo,
        domainId: domain.id,
        assignmentBasis: "domain_owner",
        assigneeId: "father",
      },
      members,
      expectedDomainVersion: 2,
      expectedTodoVersion: 3,
    }),
    DOMAIN_COMMAND_ERROR_CODES.TODO_OWNER_MISMATCH,
  );
});
