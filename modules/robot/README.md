# Robot Notification Module

This package isolates physical robot output from the scheduling, identity, consent, and notification domains. Runtime code has no third-party dependencies.

```ts
import {
  FakeRobotSpeechAdapter,
  RobotNotificationService,
} from "@we-remember/robot-adapter";

const notifications = new RobotNotificationService(new FakeRobotSpeechAdapter());
```

## Boundaries

- `RobotNotificationService` accepts an already-authorized shared-space intent, renders an allowlisted template, and serializes announcements.
- `RobotSpeechPort` is the provider-neutral boundary.
- `A3HttpSpeechAdapter` is the only AimDK-aware implementation.
- `FakeRobotSpeechAdapter` supports deterministic application and contract tests.
- The caller owns durable outbox idempotency, retries, authorization, audit, and escalation.
- A room broadcast is delivery evidence for the device transport only. It is never proof that a person heard or completed a task.

## Install and verify

```powershell
npm ci
npm run check
npm test
```

## Configuration

Copy variable names from `.env.example` into deployment secret/configuration management. Do not commit a real environment file.

- `ROBOT_A3_ENABLED`: defaults to `false`.
- `ROBOT_A3_BASE_URL`: required when enabled. Plain HTTP is accepted only for loopback/private-network hosts.
- `ROBOT_A3_DOMAIN`: safe caller label, default `we-remember`.
- `ROBOT_A3_SMOKE_CONFIRM`: must equal `PLAY_AUDIO_ON_A3` for the live smoke script.

The module does not default to a device IP. Deployment must explicitly select the robot endpoint.

## Explicit live smoke test

The command below causes a physical robot to play audio. Run it only while connected to the intended A3 standard device and after checking the room is safe for an announcement.

```powershell
$env:ROBOT_A3_ENABLED='true'
$env:ROBOT_A3_BASE_URL='http://10.42.10.10:59301'
$env:ROBOT_A3_SMOKE_CONFIRM='PLAY_AUDIO_ON_A3'
npm run smoke:a3 -- '都记得机器人接口测试'
```

The script prints only a stable outcome and provider trace ID. It does not print the base URL, spoken text, response body, or configuration.

## Deliberate exclusions

- No browser integration or direct device call from the static prototype.
- No neck motion until the exact standard-A3 v3.1/v3.2 topic and safety contract is verified on site.
- No pretend local-PCM fallback. Offline playback belongs behind another `RobotSpeechPort` implementation after the file deployment and playback RPC are frozen.
- No `targetId` claim. The A3 output is a shared physical-space broadcast.
