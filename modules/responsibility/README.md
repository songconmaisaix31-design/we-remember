# Responsibility Ownership Module

This dependency-free ESM package proves the frozen P0 responsibility, consent, reminder, and handover rules without changing the existing browser application.

## Public entry points

```js
import {
  analyzeResponsibility,
  createResponsibilityPorts,
  createResponsibilityService,
  createResponsibilityStore,
  projectResponsibilityState,
  submitHandover,
} from "@we-remember/responsibility";

import {
  acceptFixtureHandover,
  createGoldenResponsibilityFixture,
  reviseFixtureHandover,
  submitFixtureHandover,
} from "@we-remember/responsibility/fixture";
```

- `model` exposes the closed-world records, validators, member resolution, human-owner invariant, optimistic version checks, and transition matrix.
- `handover` exposes lifecycle reducers, atomic acceptance, reminder derivation, and todo completion.
- `privacy` exposes private-by-default evidence, separate consent records, safe projections, and retry-once AI-output validation.
- `fixture` is a pure integration harness. Each reducer receives a snapshot and returns a new snapshot only after a successful leaf result.
- `store` is an atomic, immutable in-memory snapshot boundary with revision and idempotency receipts.
- `service` verifies caller membership, binds trusted actor/family context, invokes injected pure ports, and commits only through the Store.

Service idempotency fingerprints are SHA-256 digests of an operation-specific closed field set. They include every field that can change a P0 command result, such as a revision patch or decision time, while retaining no raw command payload. Reusing a key with a different effective command fails with `idempotency_conflict`.

The integration adapters also enforce the boundaries that span leaf modules: only a Todo's resolved assignee may complete it; an Agent may complete only its own explicitly assigned Todo; `pending_ack` requires one active same-family human proposed owner; and reminder re-derivation preserves terminal plans. Perspective facts are derived from the current snapshot and remain presentation data rather than authorization.

## Verify

No install step is required for this package.

```powershell
cd modules/responsibility
npm test
npm run check
npm run demo
```

The golden integration test and runnable demo use the actual `createResponsibilityStore` plus `createResponsibilityService` path. They cover private fact/expression/request separation, consented family projection, `pending_info`, `pending_ack`, unchanged-owner failures, accepted owner and reminder migration, an old-owner notice, privacy-safe audit projection, Store-level replay, conflict, decline, expiry, and todo completion.

## Evidence boundary

This package proves deterministic in-memory state transitions and an in-process Store/Service boundary only. It does not provide production persistence, authentication, durable database transactions, external delivery, or provider credentials. A production adapter must preserve the same validation, privacy, version, idempotency, and atomicity invariants rather than treating the Fixture or in-memory Store as production infrastructure.
