import {
  RobotAdapterError,
  type RobotSpeechEvidence,
  type RobotSpeechPort,
  type RobotSpeechRequest,
} from "./contracts.ts";

const PLAY_PATH = "/rpc/aimdk.protocol.TTSService/PlayTTS";
const STATUS_PATH = "/rpc/aimdk.protocol.TTSService/GetAudioStatus";
const STOP_PATH = "/rpc/aimdk.protocol.TTSService/StopTTSTraceId";
const MAX_TTS_BYTES = 1024;
const MAX_RESPONSE_BYTES = 16 * 1024;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface A3HttpSpeechAdapterConfig {
  baseUrl: string;
  domain: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

export interface A3HttpSpeechAdapterDependencies {
  fetch?: FetchLike;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  createTraceId?: () => string;
}

export class A3HttpSpeechAdapter implements RobotSpeechPort {
  readonly #baseUrl: string;
  readonly #domain: string;
  readonly #requestTimeoutMs: number;
  readonly #pollIntervalMs: number;
  readonly #maxWaitMs: number;
  readonly #fetch: FetchLike;
  readonly #sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly #createTraceId: () => string;

  constructor(config: A3HttpSpeechAdapterConfig, dependencies: A3HttpSpeechAdapterDependencies = {}) {
    this.#baseUrl = normalizeBaseUrl(config.baseUrl);
    this.#domain = validateDomain(config.domain);
    this.#requestTimeoutMs = validateDuration(config.requestTimeoutMs ?? 4_000, "requestTimeoutMs");
    this.#pollIntervalMs = validateDuration(config.pollIntervalMs ?? 1_000, "pollIntervalMs");
    this.#maxWaitMs = validateDuration(config.maxWaitMs ?? 60_000, "maxWaitMs");
    if (this.#pollIntervalMs > this.#maxWaitMs) {
      throw new RobotAdapterError("INVALID_CONFIGURATION", false);
    }
    this.#fetch = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
    this.#sleep = dependencies.sleep ?? abortableSleep;
    this.#createTraceId = dependencies.createTraceId ?? createDefaultTraceId;
  }

  async speak(request: RobotSpeechRequest, signal?: AbortSignal): Promise<RobotSpeechEvidence> {
    validateSpeechRequest(request);
    const clientTraceId = validateTraceId(this.#createTraceId());
    const playResponse = await this.#postJson(
      PLAY_PATH,
      {
        text: request.text,
        priority_level: "INTERACTION_L6",
        domain: this.#domain,
        trace_id: clientTraceId,
        is_interrupted: request.interruptCurrent,
      },
      signal,
    );
    const providerTraceId = parsePlayResponse(playResponse);
    let lastProviderStatus = "TTSStatusType_Unknown";
    let observedActiveStatus = false;

    for (let elapsed = 0; elapsed < this.#maxWaitMs; elapsed += this.#pollIntervalMs) {
      await this.#sleep(this.#pollIntervalMs, signal);
      const statusResponse = await this.#postJson(STATUS_PATH, { trace_id: providerTraceId }, signal);
      lastProviderStatus = parseStatusResponse(statusResponse);

      switch (lastProviderStatus) {
        case "TTSStatusType_End":
          return {
            state: "completed",
            providerTraceId,
            providerStatus: lastProviderStatus,
            completionEvidence: "explicit_end",
          };
        case "TTSStatusType_NOTInQue":
          if (observedActiveStatus) {
            return {
              state: "completed",
              providerTraceId,
              providerStatus: lastProviderStatus,
              completionEvidence: "queue_absent_after_accept",
            };
          }
          break;
        case "TTSStatusType_Stop":
          return { state: "cancelled", providerTraceId, providerStatus: lastProviderStatus };
        case "TTSStatusType_Error":
          throw new RobotAdapterError("A3_PLAYBACK_ERROR", true);
        case "TTSStatusType_Begin":
        case "TTSStatusType_InQue":
        case "TTSStatusType_Playing":
          observedActiveStatus = true;
          break;
      }
    }

    if (lastProviderStatus === "TTSStatusType_NOTInQue" && !observedActiveStatus) {
      return { state: "accepted_unverified", providerTraceId, providerStatus: lastProviderStatus };
    }
    return { state: "timed_out", providerTraceId, lastProviderStatus };
  }

  async stop(providerTraceId: string, signal?: AbortSignal): Promise<void> {
    await this.#postJson(STOP_PATH, { trace_id: validateTraceId(providerTraceId) }, signal);
  }

  async #postJson(path: string, body: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<unknown> {
    const timeoutSignal = AbortSignal.timeout(this.#requestTimeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: requestSignal,
      });
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw new RobotAdapterError("A3_REQUEST_ABORTED", true, { cause: error });
      }
      throw new RobotAdapterError("A3_HTTP_ERROR", true, { cause: error });
    }

    if (!response.ok) {
      throw new RobotAdapterError("A3_HTTP_ERROR", response.status >= 500 || response.status === 429);
    }

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new RobotAdapterError("A3_INVALID_RESPONSE", false);
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error: unknown) {
      throw new RobotAdapterError("A3_INVALID_RESPONSE", false, { cause: error });
    }
  }
}

function parsePlayResponse(value: unknown): string {
  if (!isRecord(value)) {
    throw new RobotAdapterError("A3_INVALID_RESPONSE", false);
  }
  const accepted = typeof value.is_sucess === "boolean" ? value.is_sucess : value.is_success;
  if (typeof accepted !== "boolean" || typeof value.trace_id !== "string" || value.trace_id.length === 0) {
    throw new RobotAdapterError("A3_INVALID_RESPONSE", false);
  }
  if (!accepted) {
    throw new RobotAdapterError("A3_REJECTED", true);
  }
  return validateTraceId(value.trace_id);
}

function parseStatusResponse(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.tts_status) || typeof value.tts_status.tts_status !== "string") {
    throw new RobotAdapterError("A3_INVALID_RESPONSE", false);
  }
  return value.tts_status.tts_status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSpeechRequest(request: RobotSpeechRequest): void {
  const byteLength = new TextEncoder().encode(request.text).byteLength;
  if (byteLength === 0) {
    throw new RobotAdapterError("INVALID_INTENT", false);
  }
  if (byteLength > MAX_TTS_BYTES) {
    throw new RobotAdapterError("TTS_TEXT_TOO_LONG", false);
  }
}

function validateTraceId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) {
    throw new RobotAdapterError("A3_INVALID_RESPONSE", false);
  }
  return value;
}

function validateDomain(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(normalized)) {
    throw new RobotAdapterError("INVALID_CONFIGURATION", false);
  }
  return normalized;
}

function validateDuration(value: number, _name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 300_000) {
    throw new RobotAdapterError("INVALID_CONFIGURATION", false);
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error: unknown) {
    throw new RobotAdapterError("INVALID_CONFIGURATION", false, { cause: error });
  }

  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new RobotAdapterError("INVALID_CONFIGURATION", false);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isPrivateHost(url.hostname))) {
    throw new RobotAdapterError("INVALID_CONFIGURATION", false);
  }
  return url.origin;
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return true;
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) return false;
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function createDefaultTraceId(): string {
  return `wr_${crypto.randomUUID().replaceAll("-", "")}`;
}

function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RobotAdapterError("A3_REQUEST_ABORTED", true));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new RobotAdapterError("A3_REQUEST_ABORTED", true));
    }, { once: true });
  });
}
