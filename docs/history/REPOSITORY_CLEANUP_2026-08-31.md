# Repository Cleanup Audit

## Frozen start

Both `origin/main` and tag `pre-cleanup-2026-08-31` resolved to `48f15ab40bb040f73483c638ab84dc79210698b9` before cleanup. Work proceeded only on `cleanup/New-gethe-point-20260831`.

## Read-only local audit

The audit covered all 33 pre-existing linked worktrees plus the isolated cleanup worktree. Of the pre-existing worktrees, 31 were clean, one integration worktree retained three modified tracked documents (`API-CONTRACT.md`, `PRD.md`, and `Tech-Spec.md`), and the original root retained untracked files only. No worktree was cleaned, reset, imported, or deleted.

At audit time there were 35 local branches and one local tag. Six branches had configured upstreams and 29 did not. Notable tracking divergence was preserved: the root `main` was 98 commits behind its upstream, a historical conversational-schedule branch was 76 commits ahead of its own upstream, and the `dujide-app-ui` branch was two commits behind its upstream.

Four commits were reachable from local refs but from no remote ref:

- `d5ee8e2b094b676bc770386dd828cf1c8e756e02` — family application acceptance coverage.
- `b54b187b8fb8dda6c741dbdc70cb7a6dadb01d3a` — family schedule and notification views.
- `2a38cc0b63596c7c9232b8bc5132e436286324ce` — acceptance projection binding.
- `f244b7a24cac6a4934ade3302dd10265eb7a9628` — ambiguous owner rejection.

These commits and all local branches remain untouched. “Not on a remote ref” is a reachability observation, not a judgment that the work should be merged or discarded.

## Retained original-root residuals

The original root contained 671 untracked files totaling 133,830,146 bytes (about 133.8 MB / 127.6 MiB). They were classified without reading credential contents:

| Class | Files | Bytes | Disposition |
| --- | ---: | ---: | --- |
| `tmp/` | 513 | 124,478,101 | Retained locally; not imported |
| generated/output material | 4 | 5,472,849 | Retained locally; not imported |
| `svg-transition/` prototypes and assets | 118 | 3,810,366 | Retained locally; not imported |
| `robot-a3/` local material | 22 | 39,304 | Retained locally; not imported |
| A3 simulator smoke material | 5 | 6,817 | Retained locally; not imported |
| other small root materials | 9 | 22,709 | Retained locally; not imported |

No residual was deleted or automatically copied into the cleanup branch. No `.env` or credential content was read. Local robot, simulator, screenshot, and generated-asset evidence was not promoted into production claims.
