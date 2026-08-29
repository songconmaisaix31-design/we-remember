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
- The static prototype opens directly on the Agent destination at desktop and 390 px mobile widths.

## Product boundaries

- No calendar provider, messaging-provider credential, or production messaging runtime is embedded in this prototype. Local CLIs may be authenticated out of process for capability checks and provisioning, but the browser never receives their credentials.
- The prototype uses deterministic local extraction for representative scenarios. Production extraction must implement the API contract and validate all model output.
- Notifications remain consent- and authorization-gated. Mentioning a person does not automatically grant permission to notify them.
- High-risk health, safety, financial, or legal content may create a draft but must not trigger consequential actions without human review.

## Prototype entry and production identity

The static prototype opens directly on the Agent destination with a fixed fictional family and the working-woman SVG as the default personal avatar. Family members use their corresponding static role SVGs. It does not present a family-key gate, family confirmation, avatar setup, or sign-out flow. This keeps the prototype focused on the conversation-to-confirmation journey and must not be interpreted as production authentication.

Production identity remains a backend responsibility. Before product deployment, the family-key exchange and session endpoints in `API-CONTRACT.md` require rate limiting, server-side keyed hashing, one-family resolution, secure session issuance, revocation, and uniform failure responses. None of those guarantees is simulated by the direct-entry prototype.

## Single family domain

The product has one domain: the family's shared time, people, reminders, and connected channels. There is no work workspace, work identity, or family/work switch. The retained family/professional SVG assets are presentation resources only and grant no capability. Workspace expansion is out of scope until the family journey has real usage evidence.

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

## Complete application shell

The signed-in prototype has four destinations that share one family context and one visual system:

- Agent: the existing conversation-first scheduling flow and confirmation card.
- Family schedule: a week-oriented view of confirmed and fixture events, with day selection, member filtering, and a clear route back to the Agent for creation.
- Family and notifications: a member roster, per-person notification routes, and truthful delivery receipts. Demo controls may change presentation state for the current session only; they never claim provider delivery or authorization.
- Connection center: the existing channel capability and installation-boundary view.

Cross-page acceptance criteria:

- Every desktop and mobile navigation item opens a distinct, titled destination; no primary navigation item is a placeholder.
- Agent confirmation updates the shared event collection, the family schedule, the today summary, and recipient-specific notification receipts without a reload.
- The family schedule supports selecting a day and filtering by family member without hiding the currently selected state from assistive technology.
- The family and notifications page distinguishes member availability, configured demo route, queued/accepted/failed delivery evidence, and actual human acknowledgement.
- Empty, filtered, pending, and confirmed states have explicit copy and a next action.
- Desktop, tablet, and 390 px mobile layouts use the same typography, surface, spacing, and interaction tokens; mobile keeps all primary actions reachable above its fixed navigation.
- Navigation, dialogs, filters, and controls are keyboard operable with visible focus treatment and appropriate pressed/current semantics.
- The prototype labels all data and preference changes as local demo state and never implies production persistence, authorization, provider delivery, reading, or task completion.

Out of scope for this delivery: backend persistence, real member administration, provider credentials, real notification sending, calendar synchronization, and production authentication.

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

## Responsibility ownership P0

The product is a family responsibility ownership and handover system. A calendar event answers when something happens, a todo answers what happens next, and a responsibility domain names the one human who remains accountable for discovering, planning, executing, and following through on the whole matter. An Agent may perform explicitly allowed subtasks but can never be the accountable owner for offline care, health, or safety.

P0 adds a responsibility map as the primary responsibility view while preserving the conversation-first schedule experience. Event confirmation shows its responsibility domain, accountable owner, helpers, and informed people. The conversation may produce a reviewable responsibility suggestion and a handover proposal; neither changes ownership before deterministic validation and the proposed owner explicitly accepts.

### P0 acceptance criteria

- Each `ResponsibilityDomain` has exactly one human `accountableOwnerId` and clearly states included and excluded scope.
- A handover follows `draft -> pending_info | pending_ack -> accepted | declined | expired`.
- Missing information, missing acknowledgement, decline, and expiry leave the owner unchanged.
- Acceptance atomically changes the owner, migrates incomplete domain-owned future todo reminders, closes handover reminders, and appends a privacy-safe audit entry.
- Event reminders target participants, todo reminders target assignees, domain reviews target the accountable owner, and handover reminders target the current confirmer.
- Completing a todo stops its reminder. Explicitly assigned collaborator todos do not migrate with domain ownership.
- Evidence is private by default. Only consented, shareable facts enter the family projection; private expression never appears in the family view or audit log.
- The demo supports mother, father, and grandmother perspectives and clearly labels perspective switching as a demo, not authentication.
- The golden flow covers a private message from mother about grandmother's follow-up burden, fact/emotion/request separation, a proposal to father, `pending_info`, `pending_ack`, acceptance, owner and reminder migration, the old-owner notice, responsibility-map refresh, and audit-log refresh.
- All Agent structured output is schema-validated. One failed validation may be retried once; a second failure falls back to manual confirmation without domain mutation.

### P0 exclusions

Image, screenshot, PDF, email, external-calendar, SMS, recurring-todo, connector, production authentication, database, and real provider delivery work remain outside P0. The physical-robot and channel-gateway modules stay unchanged. P1 cannot start until this P0 path passes its deterministic and browser checks.
