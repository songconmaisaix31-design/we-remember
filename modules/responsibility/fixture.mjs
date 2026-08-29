import {
  createFatherPerspectiveFacts,
  createGoldenResponsibilityFixture as createFixtureRecords,
  createGrandmotherPerspectiveFacts,
  createMotherPerspectiveFacts,
} from "./fixtures/index.mjs";
import { acceptHandover } from "./handover/acceptance/index.mjs";
import {
  declineHandover,
  expireHandover,
  reviseHandover,
  submitHandover,
} from "./handover/lifecycle/index.mjs";
import {
  completeTodo,
  deriveReminderPlans,
} from "./reminders/index.mjs";
import { analyzeResponsibility } from "./privacy/ai/responsibility-suggestion.mjs";
import {
  grantFamilyConsent,
  projectResponsibilityState,
  revokeFamilyConsent,
} from "./privacy/projection.mjs";

export {
  createFatherPerspectiveFacts,
  createGrandmotherPerspectiveFacts,
  createMotherPerspectiveFacts,
};
export {
  goldenMotherBurdenSuggestion,
  goldenScenarioProvider,
} from "./privacy/ai/golden-scenario.mjs";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const replaceById = (items, id, replacement) => items.map((item) => item.id === id ? replacement : item);

function freezeDeep(value) {
  if (Array.isArray(value) || isRecord(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function nextSnapshot(state, replacements) {
  return freezeDeep({ ...state, ...replacements });
}

function unchanged(state, result) {
  return Object.freeze({ ...result, nextState: state });
}

function lifecycleContext(state, command) {
  const handovers = Array.isArray(state?.handovers) ? state.handovers : [];
  const domains = Array.isArray(state?.domains) ? state.domains : [];
  const handover = handovers.find((item) => item.id === command?.handoverId);
  const domain = domains.find((item) => item.id === handover?.domainId);
  return { domain, handover };
}

function applyLifecycleResult(state, result) {
  if (!result.ok) return unchanged(state, result);
  return Object.freeze({
    ...result,
    nextState: nextSnapshot(state, {
      domains: replaceById(state.domains, result.domain.id, result.domain),
      handovers: replaceById(state.handovers, result.handover.id, result.handover),
    }),
  });
}

/** Returns the isolated, immutable starting snapshot used by P0 integration tests. */
export function createGoldenResponsibilityFixture() {
  return freezeDeep(createFixtureRecords());
}

/** Applies the lifecycle leaf reducer and replaces the fixture snapshot only on success. */
export function submitFixtureHandover(state, command = {}) {
  const context = lifecycleContext(state, command);
  return applyLifecycleResult(state, submitHandover({
    ...context,
    actorId: command.actorId,
    expectedVersion: command.expectedVersion,
  }));
}

/** Applies a proposal revision without introducing a persistence or service abstraction. */
export function reviseFixtureHandover(state, command = {}) {
  const context = lifecycleContext(state, command);
  return applyLifecycleResult(state, reviseHandover({
    ...context,
    actorId: command.actorId,
    expectedVersion: command.expectedVersion,
    patch: command.patch,
  }));
}

/** Applies a decline and preserves the original snapshot on every failed check. */
export function declineFixtureHandover(state, command = {}) {
  const context = lifecycleContext(state, command);
  return applyLifecycleResult(state, declineHandover({
    ...context,
    actorId: command.actorId,
    expectedVersion: command.expectedVersion,
  }));
}

/** Applies deterministic expiry and leaves ownership unchanged. */
export function expireFixtureHandover(state, command = {}) {
  const context = lifecycleContext(state, command);
  return applyLifecycleResult(state, expireHandover({
    ...context,
    now: command.now,
    expectedVersion: command.expectedVersion,
  }));
}

/** Normalizes acceptance failure into the same unchanged-snapshot reducer contract. */
export function acceptFixtureHandover(state, command = {}) {
  const result = acceptHandover(state, command);
  return result.ok ? result : unchanged(state, result);
}

/** Derives all fixture reminder recipients from source semantics, never from a default recipient. */
export function deriveFixtureReminders(state, { domainReviews = [] } = {}) {
  const result = deriveReminderPlans({
    events: state?.events,
    todos: state?.todos,
    domainReviews,
    domains: state?.domains,
    handovers: state?.handovers,
  });
  if (!result.ok) return unchanged(state, result);
  return Object.freeze({
    ...result,
    nextState: nextSnapshot(state, { reminders: result.value }),
  });
}

/** Completes one fixture todo through the leaf reducer and applies both returned collections. */
export function completeFixtureTodo(state, { todoId, expectedVersion } = {}) {
  const todo = Array.isArray(state?.todos) ? state.todos.find((item) => item.id === todoId) : undefined;
  const result = completeTodo(todo, state?.reminders, expectedVersion);
  if (!result.ok) return unchanged(state, result);
  return Object.freeze({
    ...result,
    nextState: nextSnapshot(state, {
      todos: replaceById(state.todos, result.value.todo.id, result.value.todo),
      reminders: result.value.reminderPlans,
    }),
  });
}

function applyConsent(state, command, reducer) {
  const evidence = Array.isArray(state?.evidence)
    ? state.evidence.find((item) => item.id === command?.evidenceId)
    : undefined;
  const result = reducer(evidence, command?.actorId, command?.consent);
  if (!result.ok) return unchanged(state, result);
  return Object.freeze({
    ...result,
    nextState: nextSnapshot(state, {
      consents: [...state.consents, result.consent],
    }),
  });
}

/** Appends a separately validated consent record; evidence remains private and unchanged. */
export function grantFixtureFamilyConsent(state, command = {}) {
  return applyConsent(state, command, grantFamilyConsent);
}

/** Appends a revocation record so the privacy projection can fail closed by latest version. */
export function revokeFixtureFamilyConsent(state, command = {}) {
  return applyConsent(state, command, revokeFamilyConsent);
}

function withDerivedReminders(result) {
  if (!result.ok) return result;
  const derived = deriveFixtureReminders(result.nextState);
  if (!derived.ok) return derived;
  return freezeDeep({ ...result, nextState: derived.nextState });
}

function commandResultForStore(result) {
  const storeResult = { ...result };
  // Store receipts are authoritative for replay metadata.
  delete storeResult.idempotent;
  // Failed reducers must not cause the Store receipt cache to retain a snapshot.
  if (!storeResult.ok) delete storeResult.nextState;
  return freezeDeep(storeResult);
}

/**
 * Maps the accepted leaf reducers to the Service port contract. These adapters
 * stay pure: Store remains the only commit boundary and provider calls remain injected.
 */
export function createResponsibilityPorts({ provider } = {}) {
  return Object.freeze({
    analyzeResponsibility: (state, request) => analyzeResponsibility({
      provider,
      input: request?.input,
      members: state?.members,
    }),
    submitHandover: (state, command) => commandResultForStore(withDerivedReminders(
      submitFixtureHandover(state, command),
    )),
    reviseHandover: (state, command) => commandResultForStore(withDerivedReminders(
      reviseFixtureHandover(state, command),
    )),
    declineHandover: (state, command) => commandResultForStore(withDerivedReminders(
      declineFixtureHandover(state, command),
    )),
    expireHandover: (state, command) => commandResultForStore(withDerivedReminders(
      expireFixtureHandover(state, command),
    )),
    acceptHandover: (state, command) => commandResultForStore(
      acceptFixtureHandover(state, command),
    ),
    completeTodo: (state, command) => commandResultForStore(
      completeFixtureTodo(state, command),
    ),
    projectForActor: (state, request) => projectResponsibilityState(state, request?.actorId),
  });
}
