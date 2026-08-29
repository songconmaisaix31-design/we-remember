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
