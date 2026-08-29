# Integration Gateway Architecture

Status: Contract defined; local CLI control plane verified; runtime adapters not implemented

## Outcome

We Remember exposes one connection-center experience while preserving platform-specific trust boundaries. The value is reliable conversation and notification delivery with consistent identity, consent, audit, and failure semantics—not the appearance of one interchangeable bot SDK.

## Platform matrix

| Product label | Official integration surface | Inbound | Outbound | First-release position |
| --- | --- | --- | --- | --- |
| WeCom | WeCom intelligent robot or enterprise application | Supported only in the configured enterprise context | Supported according to installed capability | Separate enterprise installation |
| Personal WeChat / ClawBot | Tencent `openclaw-weixin` channel plugin | Paired direct messages only | Direct-message replies | Isolated sidecar; no group-chat claim |
| Feishu | Enterprise custom app with bot capability and event subscription | Direct messages, group mentions, card actions | Message API and cards | Preferred first native adapter |
| DingTalk | Application robot with supported event or Stream mode | Direct/group bot interactions | Robot message APIs/cards | Second native adapter |
| Feishu/DingTalk custom webhook | Group webhook | No | Group push only | Outbound-only label |
| Custom bot | HMAC-signed HTTPS gateway | Text/action events | Signed delivery webhook | Supported contract surface |

Platform availability still depends on tenant edition, administrator approval, app publication, group type, permission scope, and current vendor limits. A successful local prototype is not activation evidence.

## Canonical processing chain

```text
native callback, long connection, or signed custom event
  -> platform verification and decryption
  -> strict adapter parser
  -> canonical InboundEnvelope
  -> durable inbox claim and payload-hash dedupe
  -> installation, identity, and conversation binding
  -> deterministic RouteDecision
  -> schedule/conversation product command
  -> platform-neutral OutboundIntent
  -> durable outbox and capability-aware renderer
  -> platform send
  -> content-free delivery receipt
```

The HTTP or SDK callback acknowledges a verified, durably claimed event without waiting for the Agent. Processing resumes from inbox state. Provider retry behavior never becomes the product's transaction boundary.

## Trust and authority

- Provider bodies are untrusted until native verification or custom-bot HMAC verification succeeds.
- External IDs are opaque. Display names, phone numbers, group membership, and family-role words never establish identity.
- An authenticated product session creates a short-lived, single-use pairing challenge. The same external account completes it from the platform.
- An unbound sender receives only a fixed pairing instruction; their content is not stored as a product message.
- A group requires explicit conversation binding and bot addressing. Platform membership drift never changes family-space membership.
- External payloads cannot select internal member, space, role, visibility, consent, or authorization fields.
- WeCom and ClawBot installations never share identity bindings, conversation bindings, credentials, or capability flags.
- ClawBot QR login proves control of a WeChat channel account, not membership in a family space; product pairing remains mandatory.

## Canonical route decisions

```ts
type RouteDecision =
  | { status: "accepted"; actorBindingId: string; intent: "member_message" | "member_action" }
  | { status: "replayed"; receiptId: string }
  | { status: "ignored"; reason: "bot_echo" | "not_addressed" | "unsupported_event" }
  | {
      status: "rejected";
      reason:
        | "installation_inactive"
        | "identity_unbound"
        | "conversation_unbound"
        | "surface_mismatch"
        | "event_identity_conflict"
        | "action_invalid"
        | "action_expired"
        | "capability_missing";
    };
```

The router is deterministic and does not call a model. Agent use begins only after the route produces an authenticated product command.

## Reliability

- Inbox uniqueness is `(installationId, platformEventId)` plus the canonical payload hash.
- Same ID and same hash replays the recorded acknowledgement. Same ID and different hash is rejected.
- Outbox uniqueness is `(intentId, destinationBindingId)`.
- Processing is serialized per bound conversation; separate conversations may run concurrently.
- Retries use capped exponential backoff with jitter. Permanent permission, identity, capability, and destination failures remain visible.
- No silent fallback changes the recipient or platform.

## Secret handling and observability

- Credentials, tokens, encryption keys, webhook URLs, and HMAC secrets live only in environment configuration or a deployment secret manager.
- Product APIs reference a configuration key; they never accept or return secret values.
- Ordinary logs omit raw bodies, decrypted payloads, message content, media URLs, card values, external IDs, signatures, and provider error bodies.
- Safe telemetry is limited to internal request/installation IDs, platform enum, decision code, latency, retry class, and bounded provider error code.
- Media downloads require authorization, type/size limits, timeout, redirect policy, and host allowlisting.

## Rollout order

1. Validate the contract with fictional signed fixtures.
2. Use authenticated `lark-cli` to freeze the exact Feishu event and send command schemas, then implement one direct-message adapter, identity binding, inbox, reply, outbox, revocation, and deletion.
3. Add signed actions with authenticated web fallback.
4. Use authenticated `dws` to freeze the DingTalk personal-event and bot-send schemas, then add DingTalk behind the proven contract.
5. Bridge Tencent ClawBot through the signed gateway for paired direct messages only.
6. Activate WeCom only after the exact tenant, group type, and robot capability pass a feasibility test.
7. Add supported enterprise family groups after mention gating, consent, and membership-drift tests pass.

## Official references

- [WeCom intelligent robot overview](https://developer.work.weixin.qq.com/document/path/101039)
- [WeCom intelligent robot message receiving](https://developer.work.weixin.qq.com/document/path/100719)
- [WeCom intelligent robot long connection](https://developer.work.weixin.qq.com/document/path/101463)
- [WeCom application messages](https://developer.work.weixin.qq.com/document/path/90236)
- [WeChat service-account text messages](https://developers.weixin.qq.com/doc/service/guide/product/message/Receiving_standard_messages.html)
- [Feishu Open Platform](https://open.feishu.cn/)
- [Feishu send-message API](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [DingTalk robot overview](https://open.dingtalk.com/document/orgapp/robot-overview)
- [DingTalk custom robot access](https://open.dingtalk.com/document/orgapp/custom-robot-access)
- [DingTalk Workspace CLI](https://gitee.com/DingTalk-Real-AI/dingtalk-workspace-cli)
- [Tencent OpenClaw Weixin plugin](https://github.com/Tencent/openclaw-weixin)
