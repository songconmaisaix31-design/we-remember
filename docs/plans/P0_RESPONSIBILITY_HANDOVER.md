# P0 Responsibility Ownership and Handover Plan

## Goal

Implement the responsibility ownership and handover engine beside the existing We Remember conversational schedule prototype. The current hackathon batch freezes the frontend and proves behavior through public module APIs and executable tests.

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
- Frontend files are frozen for this batch. Perspective behavior is represented by privacy-safe projection APIs and fixtures, not new UI.
- Static acceptance demonstrates logical atomicity; production needs a durable transaction.

## Worktree tracks

### Model track

Write paths: `modules/responsibility/model/**` only.

Deliver strict, dependency-free ESM records, closed-world validators, member and owner invariants, transition vocabulary, safe identifiers, and colocated Node tests. Export through `modules/responsibility/model/index.mjs`. Do not edit another track or the application shell.

### Handover track

Write paths: `modules/responsibility/handover/**` only.

Deliver deterministic submit, revise, decide, expire, and todo-completion commands; reminder derivation; immutable accepted-state effects; optimistic version checks; idempotency behavior; safe audit metadata; and colocated Node tests. Depend only on the frozen contract shapes, not another worktree's uncommitted code.

### Privacy and AI-boundary track

Write paths: `modules/responsibility/privacy/**` only.

Deliver evidence/consent policy, private and family projections, forbidden-field protection, closed-world responsibility-suggestion validation, retry-once provider orchestration, manual fallback, and colocated Node tests. Raw private expression must never enter a family projection or audit metadata.

### Integration track

Starts after all three tracks pass. It owns only `modules/responsibility/index.mjs`, `modules/responsibility/fixture.mjs`, `modules/responsibility/package.json`, `modules/responsibility/test/**`, and responsibility-module documentation. It merges the exact accepted commits, composes the public API, and proves the golden flow without changing track-owned internals except for narrow merge-conflict resolution. It must not modify `app/**`.

## Public integration contract

- Model exports frozen constants, record validators, and owner/member invariants.
- Handover exports submit/revise/decide/expire, todo completion, reminder derivation, and immutable accepted-state effects.
- Privacy exports safe projection and responsibility-suggestion analysis with retry-once validation.
- Integration exports the composed public API and owns the one fixture state snapshot, replacing it only with successful command results.
- Event cards derive the accountable owner from `domainId`; they do not store a second owner field.
- `informedMemberIds` produces awareness display or a one-time informational receipt, not recurring responsibility reminders.

## Verification gates

Track checks:

```powershell
node --test "modules/responsibility/model/**/*.test.mjs"
node --test "modules/responsibility/handover/**/*.test.mjs"
node --test "modules/responsibility/privacy/**/*.test.mjs"
```

Integration and final checks:

```powershell
python -B scripts/verify_app.py
npm --prefix modules/responsibility test
node --check app/app.js
node --check scripts/browser_qa.mjs
git diff --check
```

The responsibility golden flow is exercised through the composed API and asserts every intermediate state, unchanged-owner branch, accepted atomic effects, reminder routing, privacy projection, idempotency, conflict, timeout, and audit behavior. Existing browser behavior is guarded by its unchanged structural and syntax checks; this batch makes no frontend-completion claim.

## Main risks

- A static demo can prove deterministic behavior but not durable transactionality, real authorization, or delivery. UI copy and handoff documentation must preserve this evidence boundary.
- Private text can leak through derived cards, audit metadata, or fixture serialization. Projection tests must assert both allowed fields and forbidden substrings for every perspective.
- Reminder migration can incorrectly reassign explicitly delegated work. Tests must distinguish `domain_owner` from `explicit` assignment and exclude completed todos.
- Parallel tracks can drift at their interface. Frozen record shapes and named exports above are the only cross-track contract; cross-track adaptation belongs to Integration.
