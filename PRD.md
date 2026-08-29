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
- The family-key gate, unique family confirmation, and custom avatar picker work at desktop and 390 px mobile widths.

## Product boundaries

- No calendar provider, messaging-provider credential, or production messaging runtime is embedded in this prototype. Local CLIs may be authenticated out of process for capability checks and provisioning, but the browser never receives their credentials.
- The prototype uses deterministic local extraction for representative scenarios. Production extraction must implement the API contract and validate all model output.
- Notifications remain consent- and authorization-gated. Mentioning a person does not automatically grant permission to notify them.
- High-risk health, safety, financial, or legal content may create a draft but must not trigger consequential actions without human review.

## Family-key sign-in and identity setup

The first application visit begins in a signed-out state. The primary path is:

1. Enter a family key supplied by a family administrator.
2. The server rate-limits the attempt, compares a server-side hash, and resolves exactly one active family binding.
3. The person confirms the matched family.
4. The person chooses one of 12 static SVG avatars or uploads a bounded image, then enters the family timeline.

The static prototype demonstrates this flow with the public fixture code `DEMO-HOME`. The fixture is not a secret and never represents production authentication. The entered key is cleared immediately after matching and is not persisted.

Identity acceptance criteria:

- The application content is unavailable until setup is complete.
- One valid key resolves one family; the client never offers a cross-family picker or guesses a match.
- A person chooses any of the six roles' static family or professional forms, or a local PNG, JPEG, or WebP image, before entry.
- The local prototype persists only the fictional family ID and selected avatar for the browser session.
- Signing out clears the local prototype session and returns to the login gate.
- Invalid, expired, revoked, or rate-limited keys fail closed without revealing whether a family exists.

## Single family domain

The product has one domain: the family's shared time, people, reminders, and connected channels. There is no work workspace, work identity, or family/work switch. Family and professional SVG forms are presentation-only avatar choices and grant no different capability. The selected avatar appears consistently in the profile and family header. Workspace expansion is out of scope until the family journey has real usage evidence.

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

## Physical robot notification output

An AgiBot Expedition A3 can act as an optional shared-space audio output after a notification has already passed product authorization and confirmation. It is not an identity provider, Agent, schedule authority, consent engine, or source of completion truth.

Robot acceptance criteria:

- Core scheduling and notification code depends on a provider-neutral robot speech port, never AimDK response types or URLs.
- The A3 implementation is an edge adapter selected by deployment configuration and disabled by default.
- A request identifies an authorized shared physical location rather than pretending that a room broadcast reached one named person.
- Templates are allowlisted, typed, and bounded to the official 1024-byte TTS limit.
- Concurrent announcements are serialized per adapter instance.
- Provider acceptance without playback evidence, verified playback completion, timeout, cancellation, and failure remain distinct results.
- No live robot request runs without an explicit operator smoke-test confirmation and an explicitly configured private-network base URL.
- Local audio and neck motion remain separate future adapters until their exact device contracts are verified; they are not silently simulated.

## Visual source of truth

The interaction language references the public `davidwang.space` experience as inspected on 2026-08-29:

- stable identity/navigation rail;
- translucent, rounded cards over a soft fixed backdrop;
- subtle card elevation on hover;
- short 150–300 ms state transitions;
- persistent media feedback for an active state.

The product uses its own palette, assets, hierarchy, and copy. It does not copy the reference site's background imagery, content, or branding.
