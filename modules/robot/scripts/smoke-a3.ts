import { A3HttpSpeechAdapter, parseA3RuntimeConfig, RobotAdapterError } from "../src/index.ts";

const LIVE_CONFIRMATION = "PLAY_AUDIO_ON_A3";

async function main(): Promise<void> {
  if (process.env.ROBOT_A3_SMOKE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new RobotAdapterError("ROBOT_DISABLED", false);
  }

  const config = parseA3RuntimeConfig(process.env);
  if (!config.enabled) throw new RobotAdapterError("ROBOT_DISABLED", false);

  const adapter = new A3HttpSpeechAdapter({
    baseUrl: config.baseUrl,
    domain: config.domain,
    maxWaitMs: 60_000,
  });
  const evidence = await adapter.speak({
    intentId: `smoke-${Date.now()}`,
    text: process.argv[2]?.trim() || "都记得机器人接口测试",
    priority: "normal",
    interruptCurrent: false,
  });

  process.stdout.write(`${JSON.stringify({
    status: evidence.state,
    providerTraceId: evidence.providerTraceId,
  })}\n`);
  if (evidence.state !== "completed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  const safeCode = error instanceof RobotAdapterError ? error.code : "A3_INVALID_RESPONSE";
  process.stderr.write(`${JSON.stringify({ status: "failed", code: safeCode })}\n`);
  process.exitCode = 1;
});
