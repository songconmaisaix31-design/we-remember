# PRD-to-Worktree Multi-Agent Development Protocol

Use this protocol with a PRD or development plan when the work can be divided into independent implementation tracks.

## Goal

Keep the coordinating agent focused on the whole product while long-lived development agents implement non-overlapping tracks in isolated worktrees. Do not rebuild the project, invent a scheduler, or create a proof system merely to support multiple agents.

## Operating Model

```text
Coordinating agent
  |-- Read the PRD and repository; produce a one-page plan and task cards
  |-- Dispatch 2-5 long-lived worktree agents
  |-- Read only structured progress, acceptance diffs, and test results
  `-- Dispatch one integration worktree agent

Each development track
  `-- 1 agent + 1 worktree + 1 branch + mutually exclusive write_paths
```

## Rules

1. The PRD defines the goal, scope, and acceptance criteria. Do not expand the work into a permanent platform.
2. Preserve the existing technology stack and directory structure. Do not introduce a monorepo, microservices, or many packages merely to enable parallel work.
3. Inspect file-conflict boundaries before defining tracks. If tracks would frequently edit the same files, combine them and use fewer agents.
4. Create each track's worktree once. The same agent and worktree handle implementation, tests, and corrections.
5. A worker may read the entire repository but may write only to its assigned `write_paths`. Cross-track needs become handoffs.
6. Tests are part of each task. Do not split implementation and hardening into separate rounds.
7. The coordinating agent does not write application code. It maintains the plan, status, decisions, and acceptance evidence.
8. The integration agent may add small routing, import, configuration, and type glue. Return domain defects to the original worker.
9. Do not build a custom scheduler, attempt system, hashes, manifests, or completion proofs. Use Git, tests, and runnable results for acceptance.
10. Do not claim completion while the core path, build, or applicable tests are failing.

## Workflow

### 1. Read the Inputs

Read the supplied PRD or plan and inspect the repository structure, existing components, dependencies, scripts, tests, and deployment method. Reuse existing patterns. Record assumptions for ambiguities that can be resolved safely without repeated questions.

### 2. Write a One-Page Plan

Include only:

```text
Goal / core acceptance path / out of scope / reuse / assumptions
2-5 directory-based tracks and their write_paths
Optional foundation track, only when a real shared prerequisite exists
One parallel development phase
One integration phase
Final verification commands
```

Every writable file belongs to exactly one track. Do not refactor the project merely to manufacture exclusive directories.

### 3. Write One Task Card per Track

Keep each task card to one page or less and include:

```text
Goal
Relevant PRD requirements
Fixed worktree and branch
write_paths
Deliverables
3-5 acceptance criteria
Real verification commands
Explicit exclusions
```

### 4. Dispatch Long-Lived Development Agents

Use Orca Worktree and Dispatch capabilities to create an isolated environment for each track. The coordinating agent records only status, branch, commit SHA, checks, handoffs, and risks rather than absorbing full worker conversations.

If a worker fails or acceptance does not pass, return the task to the same agent and worktree. Replace it only when the environment is damaged or the agent has materially diverged from the task.

### 5. Integrate Once

After all development tracks pass, create one isolated integration agent. It merges the branches, adds only necessary assembly glue, and runs the final install, lint, typecheck, tests, build, and core end-to-end, smoke, or demo paths. Return domain defects to the original track.

## Completion Criteria

```text
The PRD's core path runs end to end
All applicable builds and tests pass
No undisclosed critical placeholders or blockers remain
The integration branch is pushed
The README and startup instructions are reproducible
```

The final report contains only the delivered outcome, integration branch and commit SHA, verification results, and real remaining limitations.

## Maintenance

This file is the source of truth for the project's multi-agent worktree workflow. Keep `AGENTS.md` as the activation layer and update this protocol when the workflow changes.
