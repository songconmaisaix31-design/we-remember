import assert from "node:assert/strict";
import test from "node:test";
import { analyzeResponsibility, validateResponsibilitySuggestion } from "./responsibility-suggestion.mjs";
import { goldenMotherBurdenSuggestion } from "./golden-scenario.mjs";

const members = [{ id: "mother", kind: "human" }, { id: "father", kind: "human" }, { id: "agent", kind: "agent" }];

function validSuggestion(overrides = {}) {
  return {
    shareableFacts: ["Grandmother has a follow-up visit."],
    privateExpressions: ["Mother feels overloaded."],
    responsibilityRequests: ["Review a handover proposal."],
    domainSuggestion: "Grandmother follow-up coordination",
    proposedOwnerId: "father",
    missingFields: ["time"],
    clarificationQuestions: ["When is the next visit?"],
    confidence: 0.8,
    ...overrides,
  };
}

test("accepts the first valid provider response and leaves input/output immutable", async () => {
  const input = Object.freeze({ privateText: "Private burden text" });
  const output = validSuggestion();
  const result = await analyzeResponsibility({ provider: async () => output, input, members });
  assert.equal(result.status, "suggested");
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.suggestion, output);
  assert.notEqual(result.suggestion, output);
  assert.equal(Object.isFrozen(result.suggestion), true);
  assert.deepEqual(input, { privateText: "Private burden text" });
  assert.deepEqual(output, validSuggestion());
});

test("retries exactly once after invalid schema and accepts the second response", async () => {
  let calls = 0;
  const result = await analyzeResponsibility({
    provider: async (_input, { attempt }) => {
      calls += 1;
      return attempt === 1 ? { ...validSuggestion(), extra: true } : validSuggestion();
    },
    input: { request: "help" },
    members,
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "suggested");
  assert.equal(result.attempts, 2);
});

test("retries a provider throw once and exposes no raw error", async () => {
  let calls = 0;
  const result = await analyzeResponsibility({
    provider: async () => {
      calls += 1;
      if (calls === 1) throw new Error("secret provider failure");
      return validSuggestion();
    },
    input: { request: "help" },
    members,
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "suggested");
  assert.doesNotMatch(JSON.stringify(result), /secret provider failure/);
});

test("rejects extra fields, invalid confidence, and guessed or agent IDs", () => {
  assert.equal(validateResponsibilitySuggestion({ ...validSuggestion(), extra: true }, { members }).ok, false);
  assert.equal(validateResponsibilitySuggestion(validSuggestion({ confidence: 1.1 }), { members }).ok, false);
  assert.deepEqual(validateResponsibilitySuggestion(validSuggestion({ proposedOwnerId: "invented" }), { members }).issues, ["unresolved_owner_id"]);
  assert.deepEqual(validateResponsibilitySuggestion(validSuggestion({ proposedOwnerId: "agent" }), { members }).issues, ["unresolved_owner_id"]);
});

test("missing time, identity, scope, or owner requires clarification and does not infer an owner", () => {
  const unresolved = validSuggestion({ proposedOwnerId: null, missingFields: ["time", "identity", "scope", "owner"] });
  assert.equal(validateResponsibilitySuggestion(unresolved, { members }).ok, true);
  assert.equal(validateResponsibilitySuggestion({ ...unresolved, clarificationQuestions: [] }, { members }).ok, false);
});

test("returns a safe manual fallback after two failures", async () => {
  const privateText = "mother's raw burden must never leak";
  const result = await analyzeResponsibility({
    provider: async () => {
      throw new Error(privateText);
    },
    input: { privateText },
    members,
  });
  assert.deepEqual(result, { status: "manual_required", attempts: 2, issueCodes: ["provider_failure"] });
  assert.equal(Object.isFrozen(result), true);
  assert.doesNotMatch(JSON.stringify(result), /raw burden|Error/);
});

test("golden mother scenario keeps raw burden only in privateExpressions", () => {
  assert.equal(goldenMotherBurdenSuggestion.privateExpressions.length, 1);
  assert.equal(goldenMotherBurdenSuggestion.shareableFacts.some((fact) => /overwhelmed|alone/i.test(fact)), false);
  assert.equal(validateResponsibilitySuggestion(goldenMotherBurdenSuggestion, { members }).ok, true);
});
