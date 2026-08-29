# Conversational Schedule UX Prototype

A dependency-free prototype for a conversation-first shared schedule. It supports typed Agent messages, browser live dictation, auto-send voice messages, confirmation-gated scheduling, local notification receipts, and a multi-platform connection center for WeCom, Feishu, DingTalk, and signed custom bots.

## Run

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/app/` in Chrome. Microphone features require browser permission and a secure context; `localhost` and `127.0.0.1` are accepted by modern browsers.

## Verify

```powershell
python -B scripts/verify_app.py
```

This is a product interaction prototype, not a production calendar, Agent, transcription service, or notification provider. See [PRD.md](PRD.md), [Tech-Spec.md](Tech-Spec.md), and [API-CONTRACT.md](API-CONTRACT.md).

The custom-bot HTTP source of truth is [contracts/channel-gateway.openapi.yaml](contracts/channel-gateway.openapi.yaml). Platform routing and security boundaries are documented in [docs/integration-gateway.md](docs/integration-gateway.md). No platform credentials are stored in the repository.
