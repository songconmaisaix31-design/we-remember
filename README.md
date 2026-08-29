# Conversational Schedule UX Prototype

A dependency-free prototype for a conversation-first family schedule. It opens directly on the Agent destination and supports typed Agent messages, browser live dictation, auto-send voice messages, confirmation-gated scheduling, local notification receipts, and an optional multi-platform connection center.

The signed-in shell now includes complete Agent, family schedule, family and notifications, and connection-center destinations. Confirmed Agent drafts update the shared demo schedule and recipient-specific local receipts; date and member filters remain presentation-only and no page claims real delivery or persistence.

## Run

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/app/` in Chrome. Microphone features require browser permission and a secure context; `localhost` and `127.0.0.1` are accepted by modern browsers.

No key or avatar setup is required in the static prototype. Direct entry uses fixed fictional family context, defaults the current person to the working-woman SVG, and shows each family member with the matching role SVG. It does not represent production authentication.

## Verify

```powershell
python -B scripts/verify_app.py
```

The decoupled AgiBot A3 output module lives under `modules/robot/` and has its own dependency lock and checks:

```powershell
cd modules/robot
npm ci
npm run check
npm test
```

This is a product interaction prototype, not a production calendar, Agent, transcription service, or notification provider. See [PRD.md](PRD.md), [Tech-Spec.md](Tech-Spec.md), and [API-CONTRACT.md](API-CONTRACT.md).

The implemented container materials, motion recipes, responsive behavior, and visual-reference boundary are inventoried in [docs/container-motion-materials.md](docs/container-motion-materials.md).

The custom-bot HTTP source of truth is [contracts/channel-gateway.openapi.yaml](contracts/channel-gateway.openapi.yaml). Platform routing and security boundaries are documented in [docs/integration-gateway.md](docs/integration-gateway.md). No platform credentials are stored in the repository.

The visual asset library contains 12 static `family.svg` and `work.svg` endpoints under `app/assets/family-work/`. The direct-entry UI uses the working-woman asset for the current person and family-form assets for named members. Transition SVGs are excluded, and professional forms do not create or select a work workspace. Review the bundled attribution note before external distribution.

Run `powershell -ExecutionPolicy Bypass -File scripts/check_channel_clis.ps1` to emit a credential-free local readiness report for Feishu, DingTalk, and the ClawBot host. See [docs/cli-integration-runbook.md](docs/cli-integration-runbook.md) before starting any event consumer or outbound send.

Robot integration boundaries, corrected AimDK v3.1 request shapes, and the explicit live smoke-test gate are documented in [docs/robot-a3-integration.md](docs/robot-a3-integration.md). No robot network call is made by the browser prototype.
