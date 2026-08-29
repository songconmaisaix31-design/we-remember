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

## Product boundaries

- No calendar provider, messaging provider, account identity, or production Agent is connected in this prototype.
- The prototype uses deterministic local extraction for representative scenarios. Production extraction must implement the API contract and validate all model output.
- Notifications remain consent- and authorization-gated. Mentioning a person does not automatically grant permission to notify them.
- High-risk health, safety, financial, or legal content may create a draft but must not trigger consequential actions without human review.

## Visual source of truth

The interaction language references the public `davidwang.space` experience as inspected on 2026-08-29:

- stable identity/navigation rail;
- translucent, rounded cards over a soft fixed backdrop;
- subtle card elevation on hover;
- short 150–300 ms state transitions;
- persistent media feedback for an active state.

The product uses its own palette, assets, hierarchy, and copy. It does not copy the reference site's background imagery, content, or branding.
