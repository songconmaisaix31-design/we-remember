import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as responsibility from "../index.mjs";

test("publishes one dependency-free responsibility API without ambiguous exports", async () => {
  assert.deepEqual(responsibility.HANDOVER_STATUSES, [
    "draft",
    "pending_info",
    "pending_ack",
    "accepted",
    "declined",
    "expired",
  ]);
  for (const exportName of [
    "validateResponsibilityDomain",
    "assertHumanAccountableOwner",
    "createResponsibilityDomain",
    "submitHandover",
    "acceptHandover",
    "deriveReminderPlans",
    "projectResponsibilityState",
    "analyzeResponsibility",
    "createGoldenResponsibilityFixture",
    "createResponsibilityPorts",
    "createResponsibilityService",
    "createResponsibilityStore",
  ]) {
    assert.equal(typeof responsibility[exportName], "function", `${exportName} must be public`);
  }

  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.scripts.test, "node --test \"**/*.test.mjs\"");
  assert.equal(Object.hasOwn(packageJson, "dependencies"), false);
  assert.equal(Object.hasOwn(packageJson, "devDependencies"), false);
  assert.deepEqual(Object.keys(packageJson.exports).sort(), [
    ".",
    "./fixture",
    "./handover",
    "./model",
    "./privacy",
    "./service",
    "./store",
  ]);
});

test("creates an isolated immutable integration fixture", () => {
  const first = responsibility.createGoldenResponsibilityFixture();
  const second = responsibility.createGoldenResponsibilityFixture();

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.domains, second.domains);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.domains[0]), true);
  assert.equal(first.domains[0].accountableOwnerId, "mother");
});
