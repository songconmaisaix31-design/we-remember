# Project Instructions

- Project: New-gethe-point
- Initialized: 2026-08-28
- Technology stack: Static HTML/CSS/JavaScript, Node.js 24 ESM, TypeScript robot adapter, Python QA
- Package manager: npm 11
- Primary directories: `app/`, `api/`, `contracts/`, `docs/`, `modules/`, `scripts/`

## Working Rules

- Keep changes focused on the requested outcome.
- Do not introduce dependencies or abstractions without a demonstrated need.
- Preserve unrelated user changes.
- Define completion criteria before implementation and verify relevant behavior before reporting completion.
- Never store credentials or secret values in the repository.

## Multi-Agent Worktree Development

- For PRD-driven or planned development that benefits from parallel implementation, read and follow `ORCA_WORKTREE_LITE.md` before creating tasks or changing application code.
- Use one long-lived agent, one worktree, one branch, and mutually exclusive `write_paths` for each development track.
- Split tracks by actual file-conflict boundaries. Merge frequently overlapping work into one track instead of forcing parallelism.
- The coordinating agent owns planning, status, decisions, and acceptance; development agents own implementation, tests, and fixes within their assigned paths.
- Run integration once after development tracks pass. The integration agent may add only small routing, import, configuration, and type glue; domain defects return to the original development track.
- Do not build custom orchestration, attempt, hash, manifest, or proof systems for this workflow. Git history, relevant tests, and runnable behavior are the evidence.
- Do not claim completion until the core path and all applicable build and test checks pass.

## Commands

- Install root tooling: `npm ci`
- Install robot tooling: `npm ci --prefix modules/robot`
- Start the local application and same-origin demo API: `npm run dev`
- Run the complete repository gate: `npm run ci`
- Run the focused HTTP/API suite: `npm run test:http`
