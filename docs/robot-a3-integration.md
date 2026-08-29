# AgiBot A3 Robot Integration

## Decision

The Expedition A3 standard robot is an optional outbound audio adapter. It does not run the product Agent and does not own schedules, family identity, consent, recipient policy, escalation, or completion state.

```text
product outbox -> authorized shared-space intent -> robot module -> RobotSpeechPort -> A3 adapter
                                                                    -> fake/offline future adapters
```

This boundary matters because the rest of the product can be tested and deployed without a robot, and an A3 firmware or network change remains confined to one edge adapter.

## Official v3.1 contract corrections

The HandOff draft is useful for product scenarios but its sample code is not wire-compatible with the official A3 v3.1 documentation. The implementation follows the [official A3 TTS/audio documentation](https://open.agibot.com/docs/aimdk/a3/v3_0/dev_guide/07-02-audio_play) and the [official A3 v3.1 change notes](https://open.agibot.com/docs/aimdk/a3/v3_1/dev_guide):

| Concern | Official baseline used by the adapter |
| --- | --- |
| Play URL | `POST /rpc/aimdk.protocol.TTSService/PlayTTS` |
| Status URL | `POST /rpc/aimdk.protocol.TTSService/GetAudioStatus` |
| Stop URL | `POST /rpc/aimdk.protocol.TTSService/StopTTSTraceId` |
| Play input | `text`, `priority_level`, `domain`, client `trace_id`, `is_interrupted` |
| Voice field | No `speaker` field in the confirmed v3.1 request |
| Play response | Returned `trace_id` plus `is_sucess` in the documented example; parser also accepts corrected `is_success` |
| Status response | `tts_status.tts_status` |
| Completion | `End`, or `NOTInQue` after provider acceptance; `End` can be too brief to observe |
| Limit | Short text, maximum 1024 UTF-8 bytes |

The generic interface name shown as `pb:/...` in documentation tables is not part of the HTTP path. v3.2 standard-A3 compatibility is not claimed until a real device test confirms it.

## Reliability and truth

- The application persists the outbox item before invoking the adapter.
- `intentId` is the logical idempotency identity. The in-process adapter cannot guarantee deduplication after a crash.
- Announcements are serialized within one service instance. Multi-process serialization belongs in the durable outbox worker.
- `delivered` requires explicit `End`, or an observed active state followed by `NOTInQue`. `NOTInQue` without any observed active state is only `accepted_unverified` because PlayTTS success does not prove playback.
- Timeout and cancellation remain separate from failure.
- Response bodies and spoken content are excluded from adapter errors and logs.

## Network and security

- The adapter is disabled by default.
- The base URL is explicit deployment configuration, never external event input.
- Plain HTTP is allowed only for a private/loopback host because the documented device endpoint is LAN-only. Public endpoints require HTTPS.
- URLs containing credentials, query strings, fragments, or path prefixes are rejected.
- Each request has a timeout, responses have a size bound, and JSON is validated from `unknown`.
- No token or device credential is committed. If a future firmware adds authentication, credentials belong in the deployment secret manager and an adapter-local header provider.

## On-site verification gate

The live script is fail-closed. Before using it:

1. Confirm the device is Expedition A3 standard and record its exact AimDK version.
2. Confirm the operator machine and robot are on the intended private network.
3. Confirm no current announcement would create confusion or alarm.
4. Set the explicit live confirmation variable documented in `modules/robot/README.md`.
5. Run one normal-priority phrase and verify the returned status plus audible output.
6. Disconnect the network and verify a stable retryable failure code without raw device details.

Neck motion is excluded from this gate. It requires a separate motion-safety review and an exact standard-A3 contract.
