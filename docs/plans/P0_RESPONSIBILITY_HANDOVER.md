# P0 Responsibility Ownership and Handover Plan

## Goal

Extend the existing We Remember conversational schedule prototype into a responsibility ownership and handover demo without replacing its framework, shell, design system, or existing schedule flow.

## Frozen product behavior

P0 distinguishes events, todos, responsibility domains, handovers, and consented evidence. Every responsibility domain has one human accountable owner. Ownership and inherited future-action reminders move only after the proposed owner explicitly accepts a complete, current-version handover. Private expression remains private unless the subject grants family visibility to an extracted fact.

The golden browser flow is:

1. Mother privately describes the burden of grandmother's follow-up visit.
2. The system keeps the raw expression visible only to mother and presents separately reviewable shareable facts, private expression, and a responsibility request.
3. Mother creates a proposal for father.
4. Incomplete information produces `pending_info`; complete information without father acknowledgement produces `pending_ack`.
5. Father's demo perspective can revise, accept, or decline the proposal.
6. Only acceptance changes owner from mother to father, migrates domain-owned open todo reminders, closes the handover reminder, and appends a safe audit entry.
7. Mother's perspective states that she no longer receives default action reminders for the domain; the responsibility map and audit view show the same accepted state.

## Constraints and cuts

- Keep the dependency-free HTML, CSS, and JavaScript architecture.
- Reuse existing surface, card, dialog, avatar, form, focus, responsive, and reduced-motion patterns.
- Do not add packages, a router, storage, backend, provider call, or new design system.
- Do not modify `modules/robot/**`, channel contracts, gateway documents, or avatar assets.
- P1 image/PDF extraction, recurring todos, conflict detection, candidate review, email, calendars, SMS, and connectors stay blocked until P0 passes.
- Demo perspective switching is labeled as presentation state, not authentication or permission proof.
- Static acceptance demonstrates logical atomicity; production needs a durable transaction.

## Worktree tracks

### Core track

Write paths: `modules/responsibility/**` only.

Deliver strict, dependency-free ESM contracts and deterministic functions for member validation, responsibility domains, todos, handovers, evidence/consent projections, reminder routing, schema validation with one retry, immutable acceptance, fixture state, and Node tests. Export public functions through one module entry point. Do not edit the application shell.

### UI track

Write paths: `app/responsibility-ui/**` only.

Deliver presentation-only ESM renderers and scoped CSS for the responsibility map, responsibility suggestion card, handover card, domain ownership fields, responsibility-and-awareness panel, safe audit timeline, and demo perspective control. Accept safe view models and callbacks through documented props. Use DOM text APIs for untrusted content and do not implement domain transitions.

### Integration track

Starts after Core and UI acceptance. It alone owns `app/index.html`, `app/app.js`, `app/styles.css`, primary navigation, cross-track imports, `scripts/**`, delivery documentation, and browser artifacts. It merges the exact accepted Core and UI commits, wires the golden flow, and expands deterministic and browser acceptance without changing track-owned internals except for narrow merge-conflict resolution.

## Public integration contract

- Core exports frozen domain constants, fixture creation, safe projection, suggestion analysis, handover submit/revise/decide/expire commands, todo completion, and reminder derivation.
- UI exports render functions that take `{ root, viewModel, actions }`; actions are callbacks only and view models contain no private content unavailable to the active perspective.
- Integration owns the one in-memory state snapshot and replaces it only with successful Core command results.
- Event cards derive the accountable owner from `domainId`; they do not store a second owner field.
- `informedMemberIds` produces awareness display or a one-time informational receipt, not recurring responsibility reminders.

## Verification gates

Track checks:

```powershell
node --test modules/responsibility/test/*.test.mjs
node --check app/responsibility-ui/index.mjs
```

Integration and final checks:

```powershell
python -B scripts/verify_app.py
node --test modules/responsibility/test/*.test.mjs
node --check app/app.js
node --check scripts/browser_qa.mjs
python -m http.server 4173
node scripts/browser_qa.mjs
git diff --check
```

Browser QA covers 1440 x 1000, 820 x 1180, and 390 x 844, the complete golden flow, visible perspective and status semantics, keyboard operation, no horizontal overflow, no clipped primary action, and reduced motion.

## Main risks

- A static demo can prove deterministic behavior but not durable transactionality, real authorization, or delivery. UI copy and handoff documentation must preserve this evidence boundary.
- Private text can leak through derived cards, audit metadata, or fixture serialization. Projection tests must assert both allowed fields and forbidden substrings for every perspective.
- Reminder migration can incorrectly reassign explicitly delegated work. Tests must distinguish `domain_owner` from `explicit` assignment and exclude completed todos.
- Parallel tracks can drift at their interface. Frozen exports and view-model props above are the only cross-track contract; cross-track adaptation belongs to Integration.
