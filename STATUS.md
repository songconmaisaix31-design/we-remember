# Project Status

## Summary

- **Status:** ACTIVE
- **Competition:** SheNicest
- **Result:** 未获奖
- **Canonical repository:** `https://github.com/songconmaisaix31-design/we-remember`
- **Cleanup baseline:** `pre-cleanup-2026-08-31` at `48f15ab40bb040f73483c638ab84dc79210698b9`

We Remember remains an actively maintained family scheduling and care-responsibility prototype. The GitHub repository now uses the canonical `we-remember` name; this documentation update does not archive, release, deploy, or present it as a production service.

## What is runnable

From the repository root, with Node.js 24+, npm 11+, and Python 3.13+:

```powershell
npm ci
npm ci --prefix modules/robot
npm run dev
```

Open `http://127.0.0.1:4173/`. The server hosts the static application and same-origin demo API. The focused API suite is:

```powershell
npm run test:http
```

The repository gate is:

```powershell
npm run ci
```

On 2026-09-01 in this isolated canonical-link worktree, `npm run ci` passed the application structural contract, 147 responsibility tests, robot TypeScript checking, 11 robot tests, and the golden demo. `npm run test:http` also passed 4 focused HTTP/API tests. These are repository-local results, not production or hardware evidence.

## Evidence boundaries

| Area | Verified in repository | Not established |
| --- | --- | --- |
| Hackathon experience | Static UI, fictional family, preset scenarios, browser-local schedule and notification state | Real accounts, real family data, durable calendar writes, message delivery |
| Responsibility flow | Deterministic proposal lifecycle, explicit takeover confirmation, accepted responsibility/reminder migration, privacy-safe projections, in-memory Store/Service tests | Durable database transactions, production authorization, provider-backed AI decisions |
| HTTP demo | Same-origin local server and bounded Fixture-based API | Production deployment, production persistence, live user traffic |
| Channels | Contracts, documentation, and Mock connection cards | Reading private WeChat chats or history, WeChat group access, provider delivery or read receipts |
| Robot | Disabled-by-default adapter, type checks, fake-adapter tests | Physical A3 hardware safety, playback, neck motion, or field reliability |

Local simulation, screenshots, Fixture results, and generated assets are local evidence only. They are not hardware, organizer, production, or external-provider proof.

## Known limits

- The username gate is display-only and is not authentication or authorization.
- The demo uses fictional Fixture data and memory-backed state; refreshes or requests may reconstruct state.
- No database, durable outbox, external calendar, message provider, or production identity service is included.
- The prototype supports bounded scheduling and responsibility handover; it cannot resolve every family conflict and is not medical or psychological care.
- No credential access, deployment, release creation, additional repository rename, merge, or archive operation is part of this canonical-link branch.
