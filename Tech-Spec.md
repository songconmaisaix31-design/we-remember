# Conversational Schedule Prototype — Technical Specification

## Architecture

The prototype is a dependency-free static web application:

- `app/index.html`: semantic page structure and product copy.
- `app/styles.css`: responsive layout, tokens, transitions, and reduced-motion handling.
- `app/app.js`: conversation state, deterministic draft extraction, confirmation, notification receipts, and browser speech capability handling.
- `app/app.js` session setup: public family-key fixture, unique family confirmation, custom avatar choice, and session-only persistence.
- `app/index.html` connection center: truthful platform capability and installation-state presentation.
- `contracts/channel-gateway.openapi.yaml`: canonical custom-bot ingress and delivery-webhook contract.
- `docs/integration-gateway.md`: routing, identity, privacy, reliability, and platform-adapter boundaries.
- `docs/cli-integration-runbook.md`: credential-free CLI bootstrap and runtime handoff rules.
- `scripts/check_channel_clis.ps1`: safe local readiness check for `lark-cli`, `dws`, and OpenClaw without exposing account identifiers or credentials.
- `scripts/verify_app.py`: structural contract checks that require no installed packages.

This is the shortest reliable path for validating the conversation and motion model while the repository has no established framework or package manager. It avoids choosing a production stack before identity, persistence, Agent, calendar, and notification boundaries are frozen.

## Authentication state model

```text
signed_out -> key_verification -> family_confirmation -> avatar_selection -> signed_in
     ^                                                                    |
     `------------------------------ sign_out ----------------------------'
```

The prototype uses `sessionStorage` only for a fictional family ID and selected avatar. It clears the entered key after matching. Production uses server-side session state with a secure, HTTP-only, same-site cookie and never returns or persists the raw family key.

The production flow requires a backend because rate limiting, keyed hashing, binding resolution, session issuance, and revocation cannot be safely implemented in this static browser application. `DEMO-HOME` is an explicitly public UI fixture, not a production credential.

## Avatar state

```text
preset_selected ----> session avatar
bounded_upload -----> local preview -----> session avatar
```

Preset IDs are allowlisted. Local upload accepts PNG, JPEG, or WebP up to 2 MB and never sends the file in the static prototype. Production upload must decode and re-encode the image, strip metadata, enforce dimensions and size, and store only an opaque asset ID in the session.

## State model

```text
idle -> listening -> transcribing -> draft_ready -> confirmed
  |         |             |              |
  `---------+-------------+--------------`-> error
```

- `draft_ready` is non-consequential. It can be edited or discarded.
- `confirmed` appends one event and creates notification receipts.
- The prototype keeps state in memory and resets on reload.

## Voice behavior

When `SpeechRecognition` or `webkitSpeechRecognition` exists:

- Live dictation writes interim/final transcript into the composer and does not send.
- Voice message mode sends the final transcript after recognition ends.

When browser speech recognition is unavailable, controls enter an explicit unavailable state. Production uploaded-audio transcription uses `POST /api/transcriptions`; this static prototype does not fake that server result.

## Security and privacy

- Microphone capture begins only after a direct user gesture.
- The UI never reads credentials, browser storage, or private provider responses.
- Production input is untrusted at the API boundary and must be validated against the API contract.
- Agent output is a draft until a human confirms it.
- Notification recipients must be resolved to authorized identities server-side; display names are not authority.
- Logs must not contain raw audio or unnecessary transcript content.
- Family keys are high-entropy, revocable, rate-limited, and stored only as keyed hashes. Responses use a uniform failure shape to reduce family enumeration.
- One active key binding resolves exactly one family. Display names, chat names, emails, and phone numbers are never authority.
- Session cookies use `Secure`, `HttpOnly`, and `SameSite=Lax` or stricter settings. Session rotation occurs after key exchange and family confirmation.

## Integration gateway

The application and transport gateway are separate processes. Platform SDKs and credentials exist only inside adapters. The canonical flow is:

```text
verify/decrypt -> strict normalize -> durable inbox dedupe -> explicit identity and conversation binding
-> deterministic route -> product command -> durable outbox -> platform renderer/sender -> safe receipt
```

Inbound payloads cannot select `memberId`, `spaceId`, role, visibility, or authority. The gateway acknowledges a verified, durably claimed event before Agent or domain processing. Custom bots use the HMAC-signed OpenAPI contract; platform adapters implement the same canonical envelope after native verification.

`lark-cli` and `dws` are provisioning, discovery, and bounded verification tools. Production event consumption and delivery run in dedicated adapters with explicit installation identities, durable inbox/outbox state, and secret-manager references. The Tencent ClawBot plugin remains an OpenClaw sidecar and is bridged through the signed gateway; its local account state never enters the browser or product database.

## Motion rules

- Standard state transitions: 180–260 ms, ease-out.
- Draft entry: opacity plus an 8 px vertical offset.
- Card hover: at most `translateY(-4px)` with shadow change.
- Active voice: waveform amplitude and recording glow only.
- `prefers-reduced-motion: reduce` disables non-essential transitions and animation.

## Verification

```powershell
python -B scripts/verify_app.py
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/app/` and verify the primary journey in Chrome at 1440×1000 and 390×844, including overflow metrics and screenshots.

Also verify invalid-key failure, the public demo-key match, all preset avatars, a representative valid/invalid upload, session restoration, sign-out, reduced motion, and the absence of work-workspace controls.
