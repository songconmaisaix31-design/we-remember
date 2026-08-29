import assert from "node:assert/strict";
import { test } from "node:test";
import { A3HttpSpeechAdapter, RobotAdapterError } from "../src/index.ts";

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("uses the official A3 request shape and recognizes queue completion", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const responses = [
    jsonResponse({ trace_id: "client_trace_provider", is_sucess: true }),
    jsonResponse({ tts_status: { tts_status: "TTSStatusType_InQue" } }),
    jsonResponse({ tts_status: { tts_status: "TTSStatusType_NOTInQue" } }),
  ];
  const fetchMock = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as unknown });
    const response = responses.shift();
    assert.ok(response);
    return response;
  };
  const adapter = new A3HttpSpeechAdapter(
    { baseUrl: "http://10.42.10.10:59301", domain: "we-remember", pollIntervalMs: 1, maxWaitMs: 3 },
    { fetch: fetchMock, sleep: async () => undefined, createTraceId: () => "client_trace" },
  );

  const result = await adapter.speak({
    intentId: "intent-1",
    text: "奶奶，该吃药了",
    priority: "urgent",
    interruptCurrent: true,
  });

  assert.deepEqual(result, {
    state: "completed",
    providerTraceId: "client_trace_provider",
    providerStatus: "TTSStatusType_NOTInQue",
    completionEvidence: "queue_absent_after_accept",
  });
  assert.equal(calls[0]?.url, "http://10.42.10.10:59301/rpc/aimdk.protocol.TTSService/PlayTTS");
  assert.deepEqual(calls[0]?.body, {
    text: "奶奶，该吃药了",
    priority_level: "INTERACTION_L6",
    domain: "we-remember",
    trace_id: "client_trace",
    is_interrupted: true,
  });
  assert.equal(calls[1]?.url, "http://10.42.10.10:59301/rpc/aimdk.protocol.TTSService/GetAudioStatus");
});

test("accepts the corrected is_success spelling and explicit End evidence", async () => {
  const responses = [
    jsonResponse({ trace_id: "trace_returned", is_success: true }),
    jsonResponse({ tts_status: { tts_status: "TTSStatusType_End" } }),
  ];
  const adapter = new A3HttpSpeechAdapter(
    { baseUrl: "http://127.0.0.1:59301", domain: "we-remember", pollIntervalMs: 1, maxWaitMs: 2 },
    {
      fetch: async () => {
        const response = responses.shift();
        assert.ok(response);
        return response;
      },
      sleep: async () => undefined,
      createTraceId: () => "trace_request",
    },
  );

  const result = await adapter.speak({
    intentId: "intent-2",
    text: "测试",
    priority: "normal",
    interruptCurrent: false,
  });
  assert.equal(result.state, "completed");
  if (result.state === "completed") assert.equal(result.completionEvidence, "explicit_end");
});

test("returns a timeout separately from provider or playback failure", async () => {
  let call = 0;
  const adapter = new A3HttpSpeechAdapter(
    { baseUrl: "https://robot-adapter.example", domain: "we-remember", pollIntervalMs: 1, maxWaitMs: 2 },
    {
      fetch: async () => {
        call += 1;
        return call === 1
          ? jsonResponse({ trace_id: "trace_returned", is_sucess: true })
          : jsonResponse({ tts_status: { tts_status: "TTSStatusType_Playing" } });
      },
      sleep: async () => undefined,
      createTraceId: () => "trace_request",
    },
  );

  const result = await adapter.speak({
    intentId: "intent-3",
    text: "测试",
    priority: "high",
    interruptCurrent: false,
  });
  assert.deepEqual(result, {
    state: "timed_out",
    providerTraceId: "trace_returned",
    lastProviderStatus: "TTSStatusType_Playing",
  });
});

test("does not claim delivery when NOTInQue appears without an observed active state", async () => {
  let call = 0;
  const adapter = new A3HttpSpeechAdapter(
    { baseUrl: "http://10.42.10.10:59301", domain: "we-remember", pollIntervalMs: 1, maxWaitMs: 2 },
    {
      fetch: async () => {
        call += 1;
        return call === 1
          ? jsonResponse({ trace_id: "trace_returned", is_sucess: true })
          : jsonResponse({ tts_status: { tts_status: "TTSStatusType_NOTInQue" } });
      },
      sleep: async () => undefined,
      createTraceId: () => "trace_request",
    },
  );

  const result = await adapter.speak({
    intentId: "intent-unverified",
    text: "测试",
    priority: "normal",
    interruptCurrent: false,
  });
  assert.deepEqual(result, {
    state: "accepted_unverified",
    providerTraceId: "trace_returned",
    providerStatus: "TTSStatusType_NOTInQue",
  });
});

test("rejects public plain HTTP endpoints and never exposes device response bodies", async () => {
  assert.throws(
    () => new A3HttpSpeechAdapter({ baseUrl: "http://example.com", domain: "we-remember" }),
    (error: unknown) => error instanceof RobotAdapterError && error.code === "INVALID_CONFIGURATION",
  );

  const adapter = new A3HttpSpeechAdapter(
    { baseUrl: "http://10.42.10.10:59301", domain: "we-remember" },
    { fetch: async () => new Response("sensitive device details", { status: 500 }) },
  );
  await assert.rejects(
    adapter.speak({ intentId: "intent-4", text: "测试", priority: "normal", interruptCurrent: false }),
    (error: unknown) => error instanceof RobotAdapterError
      && error.code === "A3_HTTP_ERROR"
      && !error.message.includes("sensitive"),
  );
});

test("stop uses the official StopTTSTraceId path", async () => {
  let calledUrl = "";
  const adapter = new A3HttpSpeechAdapter(
    { baseUrl: "http://10.42.10.10:59301", domain: "we-remember" },
    { fetch: async (input) => { calledUrl = String(input); return jsonResponse({ state: "CommonState_UNKNOWN" }); } },
  );
  await adapter.stop("trace_to_stop");
  assert.equal(calledUrl, "http://10.42.10.10:59301/rpc/aimdk.protocol.TTSService/StopTTSTraceId");
});
