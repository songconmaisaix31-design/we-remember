# Contributing

We Remember is currently a hackathon-grade prototype with production-oriented domain boundaries. Keep contributions small, testable, and explicit about evidence limits.

## Prerequisites

- Node.js 24 or newer
- npm 11 or newer
- Python 3.13 or newer

## Setup

```powershell
npm ci
npm ci --prefix modules/robot
npm run ci
```

Start the local application with:

```powershell
npm run dev
```

Then open `http://127.0.0.1:4173/`.

## Change workflow

1. Create a focused branch or worktree. Do not develop directly on protected `main`.
2. Read `AGENTS.md`, `PRD.md`, `Tech-Spec.md`, and `API-CONTRACT.md` before changing contracts or application behavior.
3. Keep API changes contract-first and preserve privacy, consent, idempotency, and responsibility-owner invariants.
4. Run `npm run ci` before opening a pull request.
5. For UI changes, also verify a 1440 px desktop viewport and a true 390 px mobile viewport. Check overflow, overlap, focus, and the complete confirmation journey.

Use English for code, comments, identifiers, commit messages, and pull-request content. The product UI may use Chinese because the current target experience is Chinese-language.

## Pull-request evidence

Include:

- the user problem and chosen scope;
- changed paths and important contract decisions;
- exact checks run and their results;
- limitations, unexecuted checks, and external evidence boundaries.

Fixture, browser-local, simulator, and mock results must not be described as production authentication, durable persistence, external delivery, physical hardware, or end-user completion proof.

## Security

Never commit credentials, tokens, private user data, exported browser sessions, or `.env` files. Follow `SECURITY.md` for reporting vulnerabilities.
