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
- `service` resolves exactly one active actor across the snapshot, binds trusted actor/family context, invokes injected pure ports, and commits only through the Store.

Mutation commands are normalized into operation-specific closed envelopes before any port or Store revision/apply call. Unknown fields, unsupported structured values, and non-real ISO instants fail as `invalid_request`. Service idempotency fingerprints are SHA-256 digests of the complete normalized command except its separately keyed idempotency value, so they retain no raw command payload. Reusing a key with a different effective command fails with `idempotency_conflict`.

The integration adapters also enforce the boundaries that span leaf modules: only a Todo's resolved assignee may complete it; an Agent may complete only its own explicitly assigned Todo; `pending_ack` and acceptance require one active same-family human proposed owner; and reminder re-derivation preserves terminal plans by semantic source identity while allowing a new source version. Perspective facts are derived from the current snapshot and remain presentation data rather than authorization.

## Verify

No install step is required for this package.

```powershell
cd modules/responsibility
npm test
npm run check
npm run demo
```

## Run the integrated demo

The local server uses only Node.js built-ins, serves the existing `app/` UI, and exposes both a process-local API for step-by-step smoke tests and a stateless API used by the Vercel demo.

```powershell
cd modules/responsibility
npm start
```

Open `http://127.0.0.1:4173`. The page calls `GET/POST /api/responsibility`. Every stateless request reconstructs the bounded golden Fixture and runs real Store/Service commands inside that request; it does not assume a serverless process will preserve memory. The local smoke API remains available at:

- `GET /api/demo/state?actor=mother|father|grandmother`
- `POST /api/demo/analyze`
- `POST /api/demo/action`
- `POST /api/demo/reset`

The Vercel function is `api/responsibility.mjs`. From the repository root, `vercel --prod` deploys the static app and API according to `vercel.json`; domain attachment is a separate Vercel/DNS operation.

The golden integration test and runnable demo use the actual `createResponsibilityStore` plus `createResponsibilityService` path. They cover private fact/expression/request separation, consented family projection, `pending_info`, `pending_ack`, unchanged-owner failures, accepted owner and reminder migration, an old-owner notice, privacy-safe audit projection, Store-level replay, conflict, decline, expiry, and todo completion.

## Evidence boundary

This package proves deterministic in-memory state transitions and an in-process Store/Service boundary only. It does not provide production persistence, authentication, durable database transactions, external delivery, or provider credentials. A production adapter must preserve the same validation, privacy, version, idempotency, and atomicity invariants rather than treating the Fixture or in-memory Store as production infrastructure.
