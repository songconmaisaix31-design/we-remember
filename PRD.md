# Conversational Schedule MVP

## Product goal

Replace manual schedule entry with a conversation-first flow. A person can type to the Agent, dictate into the composer, or record a voice message that is transcribed and sent. The Agent turns the message into a reviewable schedule draft, then writes the confirmed event to the shared timeline and notifies only the selected people.

## Core user journey

1. The person tells the Agent what should happen, when it should happen, and who should know.
2. The Agent extracts a title, start time, participants, notification recipients, and reminder timing.
3. The Agent presents one compact confirmation card. Nothing is scheduled or sent yet.
4. The person confirms or edits the draft.
5. The event appears in the timeline and notification receipts show who will be notified and when.

## Input modes

- Text: type a natural-language message and send it.
- Live dictation: speech is transcribed into the composer so it can be edited before sending.
- Voice message: speech is transcribed and automatically sent when recording stops.
- Uploaded audio: production clients upload an audio file for server-side transcription, then display the transcript before scheduling.

## Acceptance criteria

- The primary action is talking to the Agent, not filling a schedule form.
- A typed message can produce a pending schedule draft.
- A draft does not change the timeline or create notifications before explicit confirmation.
- Confirmation adds the event to the visible timeline and creates recipient-specific notification receipts.
- Live dictation and auto-send voice controls expose recording, transcribing, success, denial, unavailable, and failure states.
- The UI does not claim that local demo notifications or transcription are production delivery.
- The desktop layout and a 390 px mobile viewport have no horizontal overflow, clipped primary action, or overlapping content.
- Reduced-motion users do not receive decorative movement.
- The login gate, space picker, avatar picker, and bidirectional role transition work at desktop and 390 px mobile widths.

## Product boundaries

- No calendar provider, messaging-provider credential, or production messaging runtime is embedded in this prototype. Local CLIs may be authenticated out of process for capability checks and provisioning, but the browser never receives their credentials.
- The prototype uses deterministic local extraction for representative scenarios. Production extraction must implement the API contract and validate all model output.
- Notifications remain consent- and authorization-gated. Mentioning a person does not automatically grant permission to notify them.
- High-risk health, safety, financial, or legal content may create a draft but must not trigger consequential actions without human review.

## Feishu sign-in and identity setup

The first application visit begins in a signed-out state. The primary path is:

1. Continue with Feishu.
2. The server validates the Feishu OAuth callback and establishes an HTTP-only application session.
3. The server resolves the authenticated `(tenantKey, openId)` only against existing, revocable external-identity bindings.
4. The person chooses one matched family or group space.
5. The person chooses one of the six role avatars, then enters the family workspace.

The static prototype demonstrates this flow with clearly labeled fictional matches. It never claims that the browser has exchanged a real OAuth code, and it stores no token or provider identifier.

Identity acceptance criteria:

- The application content is unavailable until setup is complete.
- Feishu sign-in and family/group membership are separate decisions; a provider identity never creates membership by itself.
- A person can select among matched spaces and all six role avatars.
- The local prototype persists only the selected fictional space, role, and visual mode for the browser session.
- Signing out clears the local prototype session and returns to the login gate.
- Unknown or unbound Feishu identities receive a safe no-match state instead of a guessed family.

## Family and work forms

Each role has an exact family form, work form, family-to-work animation, and work-to-family animation imported from `family-work-svg-suite-2026-08-29.zip`.

- The selected family avatar appears in profile and space controls.
- Switching to the future work workspace plays the role's family-to-work SVG once, then settles on the static work form.
- Switching back plays work-to-family once, then settles on the static family form.
- Reduced-motion users see the destination static form immediately.
- The current release changes identity presentation and workspace label only; work-domain features remain explicitly future scope.

## Connection center

The product exposes one connection center with five installation types:

- WeCom intelligent robot for supported enterprise direct or internal-group interactions;
- Personal WeChat through Tencent's ClawBot/OpenClaw channel for an explicitly paired direct chat;
- Feishu application bot for direct messages, group mentions, events, and cards;
- DingTalk application bot for direct/group interactions through its supported event or Stream mode;
- Custom bot through the signed HTTPS gateway contract.

WeCom and personal WeChat are separate installations with separate capabilities, identities, and revocation. ClawBot is limited to the direct-message capability published by its channel plugin; it does not imply personal WeChat group access. Custom outbound webhooks are labeled outbound-only.

Connection acceptance criteria:

- The connection center is reachable from desktop and mobile navigation.
- Each platform card distinguishes bidirectional application bots from outbound-only webhooks.
- The personal WeChat card identifies ClawBot as a direct-message channel and never implies group-chat support.
- No UI asks for, reads, displays, or persists secret values in this static prototype.
- The custom-bot card exposes the canonical event endpoint, signature version, acknowledgement semantics, and delivery webhook direction.
- External identities and conversations remain unbound until an authenticated, short-lived pairing flow succeeds.
- Platform acknowledgement, application acceptance, provider delivery, reading, and human confirmation are displayed as separate states.

## Visual source of truth

The interaction language references the public `davidwang.space` experience as inspected on 2026-08-29:

- stable identity/navigation rail;
- translucent, rounded cards over a soft fixed backdrop;
- subtle card elevation on hover;
- short 150–300 ms state transitions;
- persistent media feedback for an active state.

The product uses its own palette, assets, hierarchy, and copy. It does not copy the reference site's background imagery, content, or branding.
