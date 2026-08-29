import {
  readStatelessDemo,
  runStatelessDemo,
} from "../modules/responsibility/http/stateless-demo.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_URL_LENGTH = 2_048;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function safeFailure(code) {
  return {
    statusCode: code === "request_too_large" ? 413 : 400,
    body: {
      ok: false,
      error: {
        code,
        message: "The demo request could not be completed.",
      },
    },
  };
}

function send(response, result, extraHeaders = {}) {
  const payload = JSON.stringify(result.body);
  response.statusCode = result.statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Length", Buffer.byteLength(payload));
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.end(payload);
}

async function readBody(request) {
  if (isRecord(request.body)) {
    const serialized = JSON.stringify(request.body);
    return Buffer.byteLength(serialized) <= MAX_BODY_BYTES
      ? { ok: true, value: request.body }
      : { ok: false, result: safeFailure("request_too_large") };
  }
  if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
    const raw = Buffer.from(request.body);
    if (raw.length > MAX_BODY_BYTES) return { ok: false, result: safeFailure("request_too_large") };
    try {
      const value = JSON.parse(raw.toString("utf8"));
      return isRecord(value)
        ? { ok: true, value }
        : { ok: false, result: safeFailure("invalid_request") };
    } catch {
      return { ok: false, result: safeFailure("invalid_json") };
    }
  }

  const chunks = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) tooLarge = true;
    else chunks.push(chunk);
  }
  if (tooLarge) return { ok: false, result: safeFailure("request_too_large") };
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return isRecord(value)
      ? { ok: true, value }
      : { ok: false, result: safeFailure("invalid_request") };
  } catch {
    return { ok: false, result: safeFailure("invalid_json") };
  }
}

export default async function handler(request, response) {
  try {
    if (typeof request.url !== "string" || request.url.length > MAX_URL_LENGTH) {
      send(response, { ...safeFailure("uri_too_long"), statusCode: 414 });
      return;
    }
    const requestUrl = new URL(request.url, "https://demo.invalid");
    if (request.method === "GET") {
      const queryKeys = [...requestUrl.searchParams.keys()];
      if (queryKeys.length !== 1 || queryKeys[0] !== "actor") {
        send(response, safeFailure("invalid_request"));
        return;
      }
      send(response, await readStatelessDemo(requestUrl.searchParams.get("actor")));
      return;
    }
    if (request.method !== "POST") {
      send(response, {
        statusCode: 405,
        body: safeFailure("method_not_allowed").body,
      }, { Allow: "GET, POST" });
      return;
    }
    const contentType = String(request.headers?.["content-type"] ?? "").toLowerCase();
    if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
      send(response, {
        statusCode: 415,
        body: safeFailure("unsupported_media_type").body,
      });
      return;
    }
    const parsed = await readBody(request);
    if (!parsed.ok) {
      send(response, parsed.result);
      return;
    }
    send(response, await runStatelessDemo(parsed.value));
  } catch {
    send(response, {
      statusCode: 500,
      body: safeFailure("internal_error").body,
    });
  }
}
