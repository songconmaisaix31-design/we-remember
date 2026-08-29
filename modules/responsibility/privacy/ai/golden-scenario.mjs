export const goldenMotherBurdenSuggestion = Object.freeze({
  shareableFacts: Object.freeze(["Grandmother has a follow-up visit that needs coordination."]),
  privateExpressions: Object.freeze(["Mother feels overwhelmed carrying the follow-up burden alone." ]),
  responsibilityRequests: Object.freeze(["Review a handover proposal for follow-up coordination."]),
  domainSuggestion: "Grandmother follow-up coordination",
  proposedOwnerId: "father",
  missingFields: Object.freeze(["time", "scope"]),
  clarificationQuestions: Object.freeze([
    "When is the next follow-up visit?",
    "Which coordination tasks are included?",
  ]),
  confidence: 0.78,
});

export async function goldenScenarioProvider() {
  return goldenMotherBurdenSuggestion;
}
