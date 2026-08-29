import assert from "node:assert/strict";
import { test } from "node:test";
import { createA3SpeechPort, parseA3RuntimeConfig, RobotAdapterError } from "../src/index.ts";

test("is disabled by default and fails closed when invoked", async () => {
  const config = parseA3RuntimeConfig({});
  assert.deepEqual(config, { enabled: false });
  const adapter = createA3SpeechPort(config);
  await assert.rejects(
    adapter.speak({ intentId: "intent", text: "test", priority: "normal", interruptCurrent: false }),
    (error: unknown) => error instanceof RobotAdapterError && error.code === "ROBOT_DISABLED",
  );
});

test("requires an explicit base URL when enabled", () => {
  assert.throws(
    () => parseA3RuntimeConfig({ ROBOT_A3_ENABLED: "true" }),
    (error: unknown) => error instanceof RobotAdapterError && error.code === "INVALID_CONFIGURATION",
  );
  assert.deepEqual(parseA3RuntimeConfig({
    ROBOT_A3_ENABLED: "true",
    ROBOT_A3_BASE_URL: "http://10.42.10.10:59301",
  }), {
    enabled: true,
    baseUrl: "http://10.42.10.10:59301",
    domain: "we-remember",
  });
});
