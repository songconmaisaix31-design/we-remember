import {
  createFatherPerspectiveFacts,
  createGoldenResponsibilityFixture as createFixtureRecords,
  createGrandmotherPerspectiveFacts,
  createMotherPerspectiveFacts,
  createPerspectiveFacts,
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
  createPerspectiveFacts,
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

function denialResult(code = "permission_denied") {
  return {
    ok: false,
    error: Object.freeze({
      code,
      message: "Responsibility operation could not be completed.",
    }),
  };
}

function denied(state, code = "permission_denied") {
  return unchanged(state, denialResult(code));
}

function isActiveMember(member) {
  return isRecord(member) && (member.status === undefined || member.status === "active");
}

function resolveUniqueMember(state, memberId) {
  if (!Array.isArray(state?.members) || typeof memberId !== "string" || memberId.length === 0) {
    return null;
  }
  const matches = state.members.filter((member) => isRecord(member) && member.id === memberId);
  return matches.length === 1 ? matches[0] : null;
}

function enforcePendingOwner(state, result) {
  if (!result.ok || result.handover?.status !== "pending_ack") return result;
  const proposedOwner = resolveUniqueMember(state, result.handover.proposedOwnerId);
  if (!proposedOwner
    || proposedOwner.familyId !== result.handover.familyId
    || proposedOwner.kind !== "human"
    || !isActiveMember(proposedOwner)) {
    return denialResult();
  }
  return result;
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
  const result = submitHandover({
    ...context,
    actorId: command.actorId,
    expectedVersion: command.expectedVersion,
  });
  return applyLifecycleResult(state, enforcePendingOwner(state, result));
}

/** Applies a proposal revision without introducing a persistence or service abstraction. */
export function reviseFixtureHandover(state, command = {}) {
  const context = lifecycleContext(state, command);
  const result = reviseHandover({
    ...context,
    actorId: command.actorId,
    expectedVersion: command.expectedVersion,
    patch: command.patch,
  });
  return applyLifecycleResult(state, enforcePendingOwner(state, result));
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
  const handover = Array.isArray(state?.handovers)
    ? state.handovers.find((item) => item?.id === command?.handoverId)
    : undefined;
  if (handover) {
    const proposedOwner = resolveUniqueMember(state, handover.proposedOwnerId);
    if (!proposedOwner
      || proposedOwner.familyId !== handover.familyId
      || proposedOwner.kind !== "human"
      || !isActiveMember(proposedOwner)) {
      return denied(state);
    }
  }
  const result = acceptHandover(state, command);
  return result.ok ? result : unchanged(state, result);
}

/** Derives all fixture reminder recipients from source semantics, never from a default recipient. */
function reminderIdentity(plan) {
  if (!isRecord(plan)
    || typeof plan.id !== "string"
    || typeof plan.sourceType !== "string"
    || typeof plan.sourceId !== "string"
    || !Number.isSafeInteger(plan.sourceVersion)
    || typeof plan.routingBasis !== "string"
    || typeof plan.recipientId !== "string") {
    return null;
  }
  return JSON.stringify([
    plan.sourceType,
    plan.sourceId,
    plan.sourceVersion,
    plan.routingBasis,
    // Events can have multiple simultaneous participants. The other P0 sources
    // have one semantic recipient, so owner/confirmer changes must not revive a
    // completed or cancelled plan for the same source version.
    plan.sourceType === "event" ? plan.recipientId : null,
  ]);
}

function mergeReminderPlans(existingPlans, derivedPlans) {
  const terminalByIdentity = new Map();
  for (const plan of Array.isArray(existingPlans) ? existingPlans : []) {
    const identity = reminderIdentity(plan);
    if (identity && (plan.status === "completed" || plan.status === "cancelled")) {
      terminalByIdentity.set(identity, plan);
    }
  }

  const mergedByIdentity = new Map();
  for (const plan of derivedPlans) {
    const identity = reminderIdentity(plan);
    if (identity) mergedByIdentity.set(identity, terminalByIdentity.get(identity) ?? plan);
  }
  for (const [identity, plan] of terminalByIdentity) {
    if (!mergedByIdentity.has(identity)) mergedByIdentity.set(identity, plan);
  }
  return [...mergedByIdentity.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function deriveFixtureReminders(state, options = {}) {
  const suppliedOptions = isRecord(options) ? options : {};
  const domainReviews = Object.hasOwn(suppliedOptions, "domainReviews")
    ? suppliedOptions.domainReviews
    : (Array.isArray(state?.domainReviews) ? state.domainReviews : []);
  const result = deriveReminderPlans({
    events: state?.events,
    todos: state?.todos,
    domainReviews,
    domains: state?.domains,
    handovers: state?.handovers,
  });
  if (!result.ok) return unchanged(state, result);
  const reminders = mergeReminderPlans(state?.reminders, result.value);
  return Object.freeze({
    ...result,
    value: reminders,
    nextState: nextSnapshot(state, { reminders }),
  });
}

/** Completes one fixture todo through the leaf reducer and applies both returned collections. */
export function completeFixtureTodo(state, command = {}) {
  const { todoId, expectedVersion, actorId, familyId } = command;
  const todo = Array.isArray(state?.todos) ? state.todos.find((item) => item.id === todoId) : undefined;
  const actor = resolveUniqueMember(state, actorId);
  if (todo
    && (!actor
      || !isActiveMember(actor)
      || actor.familyId !== familyId
      || todo.familyId !== familyId
      || actor.id !== todo.assigneeId
      || (actor.kind === "agent" && todo.assignmentBasis !== "explicit")
      || (actor.kind !== "human" && actor.kind !== "agent"))) {
    return denied(state);
  }
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
      familyId: request?.familyId,
      input: isRecord(request?.input)
        ? { ...request.input, actorId: request.actorId, familyId: request.familyId }
        : { value: request?.input, actorId: request?.actorId, familyId: request?.familyId },
      members: Array.isArray(state?.members)
        ? state.members.filter((member) => member?.familyId === request?.familyId)
        : [],
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
    acceptHandover: (state, command) => commandResultForStore(withDerivedReminders(
      acceptFixtureHandover(state, command),
    )),
    completeTodo: (state, command) => commandResultForStore(
      completeFixtureTodo(state, command),
    ),
    projectForActor: (state, request) => projectResponsibilityState(state, {
      actorId: request?.actorId,
      familyId: request?.familyId,
    }),
  });
}
