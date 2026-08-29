# Project Instructions

- Project: New-gethe-point
- Initialized: 2026-08-28
- Technology stack: Not established
- Package manager: Not established
- Primary directories: Repository root only

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

No project-specific build, test, lint, or deployment commands are established yet.
