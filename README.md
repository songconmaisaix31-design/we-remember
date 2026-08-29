# Conversational Schedule UX Prototype

A dependency-free prototype for a conversation-first family schedule. It supports a public family-key fixture, unique family matching, 12 static SVG defaults or a locally uploaded avatar, typed Agent messages, browser live dictation, auto-send voice messages, confirmation-gated scheduling, local notification receipts, and an optional multi-platform connection center.

## Run

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/app/` in Chrome. Microphone features require browser permission and a secure context; `localhost` and `127.0.0.1` are accepted by modern browsers.

Use the public fixture code `DEMO-HOME` to test entry. It is not a production secret. The prototype clears the typed key after matching and stores only the fictional family ID and selected avatar in `sessionStorage`.

## Verify

```powershell
python -B scripts/verify_app.py
```

This is a product interaction prototype, not a production calendar, Agent, transcription service, or notification provider. See [PRD.md](PRD.md), [Tech-Spec.md](Tech-Spec.md), and [API-CONTRACT.md](API-CONTRACT.md).

The custom-bot HTTP source of truth is [contracts/channel-gateway.openapi.yaml](contracts/channel-gateway.openapi.yaml). Platform routing and security boundaries are documented in [docs/integration-gateway.md](docs/integration-gateway.md). No platform credentials are stored in the repository.

The default avatar library contains only the 12 static `family.svg` and `work.svg` endpoints under `app/assets/family-work/`. Transition SVGs are excluded, and choosing a professional form does not create or select a work workspace. Review the bundled attribution note before external distribution.

Run `powershell -ExecutionPolicy Bypass -File scripts/check_channel_clis.ps1` to emit a credential-free local readiness report for Feishu, DingTalk, and the ClawBot host. See [docs/cli-integration-runbook.md](docs/cli-integration-runbook.md) before starting any event consumer or outbound send.
