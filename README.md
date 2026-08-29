# Conversational Schedule UX Prototype

A dependency-free prototype for a conversation-first shared schedule. It supports a fictional Feishu sign-in and bound-space setup flow, six selectable family/work role identities with bidirectional SVG transitions, typed Agent messages, browser live dictation, auto-send voice messages, confirmation-gated scheduling, local notification receipts, and a multi-platform connection center.

## Run

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/app/` in Chrome. Microphone features require browser permission and a secure context; `localhost` and `127.0.0.1` are accepted by modern browsers.

The sign-in screen is a local interaction fixture, not a live Feishu OAuth callback. It stores only the fictional space, selected role, and family/work visual mode in `sessionStorage`.

## Verify

```powershell
python -B scripts/verify_app.py
```

This is a product interaction prototype, not a production calendar, Agent, transcription service, or notification provider. See [PRD.md](PRD.md), [Tech-Spec.md](Tech-Spec.md), and [API-CONTRACT.md](API-CONTRACT.md).

The custom-bot HTTP source of truth is [contracts/channel-gateway.openapi.yaml](contracts/channel-gateway.openapi.yaml). Platform routing and security boundaries are documented in [docs/integration-gateway.md](docs/integration-gateway.md). No platform credentials are stored in the repository.

The 24 runtime role assets under `app/assets/family-work/` were imported from `family-work-svg-suite-2026-08-29.zip` with SHA-256 `2EFA5E3D7EFDF631A030288E2B478CFCF1A5472645321C9D6C0ED4E4B286B988`. Review the bundled attribution note before external distribution.

Run `powershell -ExecutionPolicy Bypass -File scripts/check_channel_clis.ps1` to emit a credential-free local readiness report for Feishu, DingTalk, and the ClawBot host. See [docs/cli-integration-runbook.md](docs/cli-integration-runbook.md) before starting any event consumer or outbound send.
