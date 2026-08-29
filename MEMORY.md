# Project Memory

## Current State

- As of 2026-08-29, the repository contains a dependency-free SVG/HTML motion asset bundle under `svg-transition/`; no application framework or package manager is established.
- `svg-transition/family-work-suite/` contains six roles with exact static family/work endpoints and two one-shot transition SVGs per role (24 SVGs total). The family forms use independent home activities rather than a child as an identity cue.
- `app/` now contains a dependency-free conversational schedule UX prototype. Typed messages, live dictation, and auto-send voice messages lead to a confirmation-gated schedule draft; confirmation updates the in-page timeline and creates a truthful local notification receipt.
- The prototype connection center presents separate WeCom and personal-WeChat ClawBot installations alongside Feishu, DingTalk, and custom bots. Local Feishu and DingTalk CLIs are authenticated out of process; the page and repository never receive their credentials.
- First entry now uses a fictional Feishu sign-in fixture followed by server-bound space selection and six-role avatar selection. It is explicitly not a live OAuth callback; the local browser stores only fictional `spaceId`, role, and visual mode in `sessionStorage`.
- `app/assets/family-work/` contains the 24 verified runtime SVGs imported from desktop package SHA-256 `2EFA5E3D7EFDF631A030288E2B478CFCF1A5472645321C9D6C0ED4E4B286B988`.

## Durable Decisions

- Add project-specific architecture, testing, and deployment decisions only after they are established.
- Record secret locations only; never record secret values.
- `ORCA_WORKTREE_LITE.md` is the source of truth for PRD-driven multi-agent development. `AGENTS.md` activates it when work can be split into genuinely independent tracks.
- Each development track uses one long-lived agent, one worktree, one branch, and mutually exclusive `write_paths`; integration happens once in a separate worktree after track-level acceptance passes.
- Keep coordination lightweight: use Git, relevant tests, and runnable behavior as evidence instead of creating custom scheduling or proof infrastructure.
- The Working Woman source is Noun Project icon 7641720 by sentya irma. Keep attribution metadata in derived assets and confirm the Creative Commons attribution requirements before external distribution.
- `svg-transition/working-woman-motion/working-woman-motion.svg` is the self-contained animated asset; `logo_motion.html` is its replayable QA showcase. The accepted vector fit uses three semantic paths and records alpha-aware IoU evidence in `outputs/`.
- The mother role under `svg-transition/working-woman-mother/` is an original derivative that preserves the working-woman head as an identity anchor. It is intentionally child-free and uses an apron, saucepan, lid, and steam to show home cooking. Its bidirectional transitions use the laptop/saucepan area as the reveal focus, and their final frames must remain pixel-identical to the static role SVGs.
- `svg-transition/family-role-suite/` extends the silhouette system with five pure-vector static roles: father/home repair, daughter/reading, son/skateboarding, grandfather/cane, and grandmother/knitting. Its preview reuses the canonical mother SVG rather than duplicating it; every role must remain distinguishable at 128 px and the 390 px preview must not overflow horizontally.
- `svg-transition/family-role-suite/generate_family_work_suite.py` is the dependency-free source of truth for the family/work deliverables. Each transition must embed markup identical to its static endpoints, support reduced motion, hold on the destination, and pass the structural, 128 px, midpoint-motion, desktop, and true 390 px CDP checks before packaging.
- Conversation is the primary schedule-entry model. Natural language or voice produces a non-consequential draft first; calendar writes and notification outbox work require explicit human confirmation.
- `API-CONTRACT.md` defines the future transcription, schedule-draft, and atomic confirmation boundaries. The static prototype must not claim production transcription, identity resolution, calendar persistence, or message delivery.
- The accepted visual direction reuses the reference site's stable identity rail, translucent card depth, subtle `translateY(-4px)` hover lift, and short state transitions without copying its imagery or branding. Preserve reduced-motion behavior and verify both 1440 px desktop and true 390 px screenshots.
- `contracts/channel-gateway.openapi.yaml` is the canonical custom-bot transport contract. Requests use versioned HMAC-SHA256 over timestamp, nonce, method, path, and body hash; verified events enter a durable inbox before routing, and replies leave through an idempotent outbox.
- Native platform SDKs stay inside WeCom, Feishu, and DingTalk adapters. External payloads cannot select internal member, space, role, visibility, consent, or authority. Identity and conversation bindings are explicit and revocable.
- Personal WeChat uses Tencent's `@tencent-weixin/openclaw-weixin` ClawBot plugin as an isolated OpenClaw sidecar. Treat its published surface as paired direct messages only: do not claim personal group support, read chat history, share identity bindings with WeCom, or copy channel credentials into product storage.
- `lark-cli` and DingTalk Workspace CLI (`dws`) are the approved local control-plane tools for discovery, dry runs, and bounded verification. Production transport still requires dedicated adapters, explicit application/bot identities, administrator-approved scopes, durable inbox/outbox processing, and revocable identity/conversation bindings.
- Feishu developer CLI authentication and end-user web login are separate trust boundaries. Production login exchanges OAuth codes server-side, matches `(tenantKey, openId)` only to existing revocable bindings, issues a secure application session, and fails closed when no family or group is bound.
- Family/work presentation is a reversible identity mode, not an authorization change. Each switch uses the selected role's one-shot transition SVG, settles on the exact static endpoint after 2400 ms, skips animation for reduced-motion users, and guards stale timers with a transition revision.
