# Conversational Schedule API Contract

## Principles

- Natural language and audio produce drafts, never immediate calendar or notification writes.
- Confirmation binds the actor, draft revision, intended event, recipients, and idempotency key.
- Display names are presentation data. Server-resolved subject IDs are authoritative.
- All external input and Agent output is validated at the trust boundary.
- Feishu identity proves only the external subject. Family and group access comes from an existing application binding.
- OAuth codes and tokens remain server-side and never appear in product JSON responses or browser storage.

## Feishu authentication

### `GET /api/auth/feishu/start`

Creates a single-use OAuth state bound to the initiating browser session and redirects to Feishu. The redirect URI is server-configured and allowlisted; clients cannot supply it.

### `GET /api/auth/feishu/callback`

Validates state, exchanges the authorization code server-side, resolves the external subject, rotates the application session, and redirects to `/app/`. Missing, expired, reused, or mismatched state fails closed.

### `GET /api/session`

```ts
interface SessionResponse {
  status: "signed_out" | "setup_required" | "ready";
  provider?: "feishu";
  displayName?: string;
  matchedSpaces?: Array<{
    spaceId: string;
    name: string;
    kind: "family" | "group";
    memberCount: number;
  }>;
  selectedSpaceId?: string;
  selectedRole?: FamilyRole;
  visualMode?: "family" | "work";
}

type FamilyRole =
  | "mother"
  | "father"
  | "daughter"
  | "son"
  | "grandfather"
  | "grandmother";
```

`matchedSpaces` contains only spaces already bound to the authenticated external identity. No-match returns an empty array and does not create a space implicitly.

### `POST /api/session/setup`

```ts
interface CompleteSessionSetupRequest {
  spaceId: string;
  role: FamilyRole;
}
```

The server revalidates current membership before persisting the selection and rotating the session. `spaceId` must come from the current authenticated subject's matched set.

### `POST /api/session/mode`

```ts
interface SetVisualModeRequest {
  mode: "family" | "work";
  expectedSessionRevision: number;
}
```

Visual mode is presentation state only. Selecting work mode grants no additional workspace permissions.

### `POST /api/auth/sign-out`

Revokes the application session and clears its cookie. It does not revoke the person's Feishu authorization unless they explicitly request that separate action.

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
    channel: "in_app" | "feishu" | "dingtalk" | "wecom" | "wechat_clawbot";
    status: "queued" | "not_authorized" | "failed";
  }>;
}
```

Confirmation is atomic: persist the event and notification outbox entries together. A revision conflict returns `409`; the same idempotency key returns the original result.

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
