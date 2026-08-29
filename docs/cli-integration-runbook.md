# Channel CLI Integration Runbook

## Purpose

Use `lark-cli` and DingTalk Workspace CLI (`dws`) to discover current platform schemas, verify authorization, and perform bounded dry runs. These CLIs are a control plane, not the production message runtime. Production callbacks, event streams, retries, and delivery must remain in dedicated adapters behind the canonical gateway boundary.

## Local readiness snapshot

Verified on 2026-08-29 without reading messages, contacts, calendars, credentials, tokens, or raw provider responses:

| Channel | Command | Local state |
| --- | --- | --- |
| Feishu | `lark-cli 1.0.87` | User identity verified; bot event dry run passed |
| DingTalk | `dws v1.0.60` | OAuth token and refresh token valid; personal Stream dry run passed |
| Personal WeChat | `openclaw 2026.6.11` | Compatible host installed; ClawBot login not started |

Run the safe check again instead of treating this snapshot as permanent:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check_channel_clis.ps1
```

The check emits only versions and booleans. It intentionally omits account IDs, tenant names, user names, scopes, token timestamps, filesystem paths, and credential contents.

## Feishu adapter bootstrap

1. Keep `lark-cli` authentication outside the repository.
2. Use `im.message.receive_v1` for the first bot receive path. The verified schema requires bot auth, the `im:message.p2p_msg:readonly` scope, and the matching console event subscription.
3. Preview event consumption with `lark-cli event consume im.message.receive_v1 --as bot --dry-run`.
4. Preview outbound delivery with `lark-cli im +messages-send ... --as bot --dry-run`.
5. Start a bounded event consumer only after the app identity, scopes, target conversation, retention policy, and pairing flow are accepted.

Do not send a real message until the recipient, content, sending identity, and idempotency key are explicit.

The developer-machine `lark-cli` login is not an end-user application session and never participates in family-key sign-in. Feishu is an optional notification channel; production pairing must use a separate, short-lived server-side flow that resolves an existing family member, issues no family authority from provider identity alone, and remains independently revocable.

## DingTalk adapter bootstrap

1. Use the installed `dws` command; `dingworkspace-cli` is the package concept, not the executable name.
2. Use `user_im_message_receive_o2o_all` only for the bounded personal direct-message pilot. It is a user OAuth Stream event, not an enterprise bot event.
3. Preview IM listening with `dws event +listen-im --kind all-direct --dry-run`.
4. Preview delivery with `dws chat +messages-send ... --dry-run`.
5. Do not relabel the personal OAuth pilot as a bot. Freeze a separate enterprise-robot inbound event before the robot release path, then start a bounded consumer only after the robot code, authorization scope, target conversation, and pairing flow are accepted.

Do not pass app secrets on the command line. Configure them through the CLI's protected authentication flow or deployment secret manager.

## Personal WeChat ClawBot boundary

Use the Tencent-maintained `@tencent-weixin/openclaw-weixin` plugin with a compatible OpenClaw host. Installation and QR login are explicit operator actions. The binding is separate from WeCom and supports only the direct-message capability published by the plugin.

After QR login, map the opaque OpenClaw channel account to a `wechat_clawbot` installation and require a short-lived product pairing challenge. Never import the plugin's credential files into the product, infer family membership from the WeChat account, or expose the OpenClaw gateway directly to the browser.

## Runtime handoff gate

An adapter is ready to start only when all of the following are frozen:

- provider application or channel identity;
- administrator-approved minimum scopes;
- one explicit test conversation and sender;
- inbound event key and acknowledgement behavior;
- outbound command, identity, and idempotency behavior;
- data retention and deletion behavior;
- installation revocation and binding recovery;
- fictional fixture tests followed by a bounded real-message test.
