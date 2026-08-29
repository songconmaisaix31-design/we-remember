# Conversational Schedule API Contract

## Principles

- Natural language and audio produce drafts, never immediate calendar or notification writes.
- Confirmation binds the actor, draft revision, intended event, recipients, and idempotency key.
- Display names are presentation data. Server-resolved subject IDs are authoritative.
- All external input and Agent output is validated at the trust boundary.

## `POST /api/transcriptions`

Accepts multipart audio with a supported MIME type and bounded size.

```ts
interface TranscriptionResponse {
  transcriptId: string;
  text: string;
  language: string;
  confidence: number | null;
  expiresAt: string;
}
```

The endpoint must reject unsupported media, oversized files, empty speech, expired sessions, and unauthorized actors. Raw audio retention defaults to none after transcription unless the person explicitly opts in.

## `POST /api/schedule-drafts`

```ts
interface CreateScheduleDraftRequest {
  source: "text" | "live_dictation" | "voice_message" | "audio_upload";
  text: string;
  transcriptId?: string;
  clientRequestId: string;
}

interface ScheduleDraft {
  id: string;
  revision: number;
  title: string;
  startsAt: string;
  timezone: string;
  participantIds: string[];
  notificationRecipientIds: string[];
  reminderOffsetsMinutes: number[];
  clarificationQuestions: string[];
  risk: "normal" | "needs_human_review";
  status: "pending_confirmation";
}
```

The service returns clarification questions instead of inventing missing time, identity, or notification authority.

## `POST /api/schedule-drafts/{draftId}/confirm`

```ts
interface ConfirmScheduleDraftRequest {
  expectedRevision: number;
  idempotencyKey: string;
}

interface ConfirmScheduleDraftResponse {
  eventId: string;
  status: "scheduled";
  notificationReceipts: Array<{
    recipientId: string;
    channel: "in_app" | "feishu" | "dingtalk" | "wechat";
    status: "queued" | "not_authorized" | "failed";
  }>;
}
```

Confirmation is atomic: persist the event and notification outbox entries together. A revision conflict returns `409`; the same idempotency key returns the original result.

## Channel gateway

`contracts/channel-gateway.openapi.yaml` is the HTTP source of truth for custom bots. Native WeCom, Feishu, and DingTalk adapters normalize into the same internal types but keep provider SDK types private.

```ts
type ChannelPlatform = "wecom" | "feishu" | "dingtalk" | "custom_bot";

interface InboundEnvelope {
  schemaVersion: 1;
  platform: ChannelPlatform;
  installationId: string;
  platformEventId: string;
  platformConversationId: string;
  platformSenderId: string;
  surface: "direct" | "group";
  eventKind: "message" | "action";
  occurredAt: string;
  receivedAt: string;
  payload: InboundMessage | InboundAction;
}
```

Provider payloads begin as `unknown`. Verification and strict parsing happen before an envelope is created. External requests never supply an internal member, family space, role, consent, visibility, or authorization decision.

### Required records

- `ChannelInstallation`: platform, tenant, ingress mode, capabilities, active/revoked status, and secret-manager configuration reference.
- `ChannelIdentityBinding`: one verified external user to one member within an installation.
- `ChannelConversationBinding`: one verified external conversation to one internal conversation and family space.
- `ChannelInboxItem`: `(installationId, platformEventId)`, canonical payload hash, claim state, and content-retention reference.
- `ChannelOutboxItem`: logical intent, resolved destination binding, attempt state, and content-free provider receipt.

### Delivery truth

The public states are `queued`, `accepted_by_gateway`, `accepted_by_provider`, `failed`, and `cancelled`. They do not imply that a person received, read, understood, consented to, or completed the underlying task.

### Custom bot signing

Custom bots sign the exact request target and body with secret-manager material that is never accepted by the product API:

```text
v1\n{unixTimestamp}\n{nonce}\n{method}\n{path}\n{lowercaseSha256HexOfBody}
```

`X-WR-Signature` is lowercase hex HMAC-SHA256 over that canonical string. The gateway verifies the body hash, a 300-second timestamp window, a single-use nonce, installation status, and the signature before parsing JSON. Reuse of `(installationId, platformEventId)` with a different body hash returns `409 event_identity_conflict`.
