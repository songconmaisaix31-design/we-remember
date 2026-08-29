# Conversational Schedule API Contract

## Principles

- Natural language and audio produce drafts, never immediate calendar or notification writes.
- Confirmation binds the actor, draft revision, intended event, recipients, and idempotency key.
- Display names are presentation data. Server-resolved subject IDs are authoritative.
- All external input and Agent output is validated at the trust boundary.
- A family key resolves exactly one active family binding and never grants cross-family discovery.
- Raw family keys remain transient, are never logged or returned, and are stored only as server-side keyed hashes.

## Family-key authentication

### `POST /api/auth/family-key/exchange`

```ts
interface ExchangeFamilyKeyRequest {
  familyKey: string;
}

interface ExchangeFamilyKeyResponse {
  family: {
    familyId: string;
    name: string;
    memberCount: number;
  };
  setupRequired: true;
}
```

The endpoint normalizes bounded input, applies account- and network-level rate limits, compares a keyed hash in constant time, resolves exactly one active binding, rotates the application session, and returns no key material. Invalid, expired, revoked, and throttled attempts use a uniform public error response.

### `GET /api/session`

```ts
interface SessionResponse {
  status: "signed_out" | "setup_required" | "ready";
  family?: {
    familyId: string;
    name: string;
    memberCount: number;
  };
  avatar?: { kind: "preset"; presetId: AvatarPresetId } | { kind: "upload"; assetId: string };
}

type AvatarRole = "mother" | "father" | "daughter" | "son" | "grandfather" | "grandmother";
type AvatarForm = "family" | "work";
type AvatarPresetId = `${AvatarRole}-${AvatarForm}`;
```

The session never exposes other families that a key did not select.
The `work` suffix identifies a static visual form only; it does not select a work workspace or alter authorization.

### `POST /api/session/setup`

```ts
interface CompleteSessionSetupRequest {
  avatar: { kind: "preset"; presetId: AvatarPresetId } | { kind: "upload"; assetId: string };
}
```

The server revalidates the pending family-key session before persisting the avatar and rotating into a ready session. Uploaded images use a separate bounded multipart endpoint that decodes and re-encodes supported formats, strips metadata, and returns an opaque `assetId`.

### `POST /api/auth/sign-out`

Revokes the application session and clears its cookie. It does not revoke the family key; family administrators manage key rotation separately.

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
    channel: "in_app" | "feishu" | "dingtalk" | "wecom" | "wechat_clawbot" | "robot_a3";
    status: "queued" | "not_authorized" | "failed";
  }>;
}
```

Confirmation is atomic: persist the event and notification outbox entries together. A revision conflict returns `409`; the same idempotency key returns the original result.

## Robot notification port

This is an internal application-to-adapter contract, not a public HTTP endpoint:

```ts
type RobotTemplateData =
  | { template: "care_reminder"; data: { subjectName?: string; title: string; instruction: string } }
  | { template: "escalation"; data: { subjectName: string; title: string } }
  | { template: "handover_confirm"; data: { domainName: string } };

type RobotNotificationIntent = RobotTemplateData & {
  intentId: string;
  installationId: string;
  audience: { kind: "shared_space"; locationId: string };
  priority: "normal" | "high" | "urgent";
};

interface RobotSpeechPort {
  speak(request: RobotSpeechRequest, signal?: AbortSignal): Promise<RobotSpeechEvidence>;
  stop(providerTraceId: string, signal?: AbortSignal): Promise<void>;
}
```

`intentId` is application-owned idempotency identity; an adapter cannot provide durable deduplication. A shared-space broadcast never proves that a named member heard, understood, consented to, or completed the reminder. Adapter errors expose stable codes and safe metadata only, not device response bodies or spoken text.
Robot results distinguish `accepted_unverified`, `delivered`, `timed_out`, `cancelled`, and `failed`. `accepted_unverified` is required when AimDK reports queue absence without any observed active playback state.

## Channel gateway

`contracts/channel-gateway.openapi.yaml` is the HTTP source of truth for custom bots and the isolated ClawBot sidecar bridge. Native WeCom, Feishu, and DingTalk adapters normalize into the same internal types but keep provider SDK types private.

```ts
type ChannelPlatform = "wecom" | "wechat_clawbot" | "feishu" | "dingtalk" | "custom_bot";

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

### Personal WeChat ClawBot boundary

- `wechat_clawbot` and `wecom` are never interchangeable installations.
- ClawBot supports only the direct-message surface declared by the installed Tencent channel plugin.
- QR login and channel credentials remain in the OpenClaw state directory; the product stores only an opaque installation reference and revocable bindings.
- A ClawBot sender must complete the same short-lived product pairing flow as every other external identity.
- The adapter cannot read historical chats, infer membership, or elevate a sender into an internal role.
