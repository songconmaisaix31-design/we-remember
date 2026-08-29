import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import {
  FakeRobotSpeechAdapter,
  RobotNotificationService,
  type RobotSpeechEvidence,
  type RobotSpeechPort,
  type RobotSpeechRequest,
} from "../src/index.ts";

const baseIntent = {
  installationId: "robot-installation-1",
  audience: { kind: "shared_space" as const, locationId: "living-room" },
  priority: "normal" as const,
};

test("renders an allowlisted care template and returns delivery evidence", async () => {
  const speech = new FakeRobotSpeechAdapter();
  const service = new RobotNotificationService(speech);
  const result = await service.send({
    ...baseIntent,
    intentId: "intent-1",
    template: "care_reminder",
    data: { subjectName: "奶奶", title: "血压药", instruction: "饭后吃" },
  });

  assert.deepEqual(result, {
    status: "delivered",
    intentId: "intent-1",
    providerTraceId: "fake_trace",
    evidence: "explicit_end",
  });
  assert.equal(speech.requests[0]?.text, "奶奶，血压药时间到了，饭后吃");
});

test("rejects invalid identities and oversized UTF-8 output without calling the adapter", async () => {
  const speech = new FakeRobotSpeechAdapter();
  const service = new RobotNotificationService(speech);
  const invalidIdentity = await service.send({
    ...baseIntent,
    intentId: "contains spaces",
    template: "handover_confirm",
    data: { domainName: "照护责任" },
  });
  assert.deepEqual(invalidIdentity, {
    status: "failed",
    intentId: "contains spaces",
    code: "INVALID_INTENT",
    retryable: false,
  });

  const oversized = await service.send({
    ...baseIntent,
    intentId: "intent-2",
    template: "care_reminder",
    data: { title: "药".repeat(300), instruction: "请".repeat(300) },
  });
  assert.equal(oversized.status, "failed");
  if (oversized.status === "failed") assert.equal(oversized.code, "TTS_TEXT_TOO_LONG");
  assert.equal(speech.requests.length, 0);
});

test("serializes concurrent announcements", async () => {
  let active = 0;
  let maximumActive = 0;
  const speech: RobotSpeechPort = {
    async speak(request: RobotSpeechRequest): Promise<RobotSpeechEvidence> {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(10);
      active -= 1;
      return {
        state: "completed",
        providerTraceId: `trace_${request.intentId}`,
        providerStatus: "TTSStatusType_End",
        completionEvidence: "explicit_end",
      };
    },
    stop: async () => undefined,
  };
  const service = new RobotNotificationService(speech);

  await Promise.all([
    service.send({ ...baseIntent, intentId: "intent-a", template: "handover_confirm", data: { domainName: "A" } }),
    service.send({ ...baseIntent, intentId: "intent-b", template: "handover_confirm", data: { domainName: "B" } }),
  ]);

  assert.equal(maximumActive, 1);
});
