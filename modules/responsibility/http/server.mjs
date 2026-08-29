import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDemoRuntime,
  readStatelessDemo,
  runStatelessDemo,
} from "./stateless-demo.mjs";

const FAMILY_ID = "family-willow";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_URL_LENGTH = 2_048;
const ALLOWED_ACTORS = new Set(["mother", "father", "grandmother"]);
const STATIC_ROOT = fileURLToPath(new URL("../../../app/", import.meta.url));
const STATIC_CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);
const ACTIONS = Object.freeze({
  accept: "accept",
  completeTodo: "completeTodo",
  decline: "decline",
  revise: "revise",
  submit: "submit",
});

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeError(code, message = "The demo request could not be completed.") {
  return { ok: false, error: { code, message } };
}

function statusForResult(result) {
  const code = result?.error?.code;
  if (["permission", "permission_denied", "viewer_unauthorized"].includes(code)) return 403;
  if (["conflict", "idempotency_conflict", "version_conflict"].includes(code)) return 409;
  if (code === "not_found") return 404;
  return 400;
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(payload);
}

async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] ?? "").toLowerCase();
  if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
    return { ok: false, statusCode: 415, error: safeError("unsupported_media_type") };
  }
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
    return { ok: false, statusCode: 400, error: safeError("invalid_request") };
  }
  if (declaredLength > MAX_BODY_BYTES) {
    request.resume();
    return { ok: false, statusCode: 413, error: safeError("request_too_large") };
  }

  const chunks = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) return { ok: false, statusCode: 413, error: safeError("request_too_large") };
  if (bytes === 0) return { ok: false, statusCode: 400, error: safeError("invalid_json") };

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return isRecord(value)
      ? { ok: true, value }
      : { ok: false, statusCode: 400, error: safeError("invalid_request") };
  } catch {
    return { ok: false, statusCode: 400, error: safeError("invalid_json") };
  }
}

function parseActor(value) {
  return typeof value === "string" && ALLOWED_ACTORS.has(value) ? value : null;
}

function caller(actorId) {
  return Object.freeze({ actorId, familyId: FAMILY_ID });
}

async function viewPayload(runtime, actorId) {
  const viewed = await runtime.service.view(caller(actorId));
  if (!viewed.ok) return viewed;
  return {
    ok: true,
    mode: "demo_in_memory",
    revision: runtime.store.currentRevision(),
    actorId,
    projection: viewed.projection,
  };
}

function validateAnalyzeBody(body) {
  return hasExactKeys(body, ["actorId", "text"])
    && parseActor(body.actorId) !== null
    && typeof body.text === "string"
    && body.text.trim().length > 0
    && body.text.length <= 2_000;
}

function validateActionBody(body) {
  return hasExactKeys(body, ["action", "actorId", "command"])
    && parseActor(body.actorId) !== null
    && Object.hasOwn(ACTIONS, body.action)
    && isRecord(body.command);
}

async function handleState(requestUrl, response, runtime) {
  const queryKeys = [...requestUrl.searchParams.keys()];
  const actorId = parseActor(requestUrl.searchParams.get("actor"));
  if (queryKeys.length !== 1 || queryKeys[0] !== "actor" || !actorId) {
    sendJson(response, 400, safeError("invalid_request"));
    return;
  }
  const payload = await viewPayload(runtime, actorId);
  sendJson(response, payload.ok ? 200 : statusForResult(payload), payload);
}

async function handleAnalyze(request, response, runtime) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    sendJson(response, parsed.statusCode, parsed.error);
    return;
  }
  if (!validateAnalyzeBody(parsed.value)) {
    sendJson(response, 400, safeError("invalid_request"));
    return;
  }

  const { actorId, text } = parsed.value;
  const suggestion = await runtime.service.suggest(caller(actorId), { text: text.trim() });
  if (suggestion.ok === false) {
    sendJson(response, statusForResult(suggestion), suggestion);
    return;
  }
  const state = await viewPayload(runtime, actorId);
  sendJson(response, 200, {
    ok: true,
    mode: "demo_in_memory",
    revision: runtime.store.currentRevision(),
    actorId,
    suggestion,
    projection: state.projection,
  });
}

async function handleAction(request, response, runtime) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    sendJson(response, parsed.statusCode, parsed.error);
    return;
  }
  if (!validateActionBody(parsed.value)) {
    sendJson(response, 400, safeError("invalid_request"));
    return;
  }

  const { action, actorId, command } = parsed.value;
  const result = await runtime.service[ACTIONS[action]](caller(actorId), command);
  if (!result.ok) {
    sendJson(response, statusForResult(result), result);
    return;
  }
  const state = await viewPayload(runtime, actorId);
  sendJson(response, 200, {
    ok: true,
    mode: "demo_in_memory",
    revision: runtime.store.currentRevision(),
    actorId,
    result,
    projection: state.projection,
  });
}

async function handleReset(request, response, replaceRuntime) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    sendJson(response, parsed.statusCode, parsed.error);
    return;
  }
  if (!hasExactKeys(parsed.value, ["actorId"])) {
    sendJson(response, 400, safeError("invalid_request"));
    return;
  }
  const actorId = parseActor(parsed.value.actorId);
  if (!actorId) {
    sendJson(response, 400, safeError("invalid_request"));
    return;
  }
  const runtime = replaceRuntime();
  sendJson(response, 200, await viewPayload(runtime, actorId));
}

async function handleStateless(request, requestUrl, response) {
  if (request.method === "GET") {
    const queryKeys = [...requestUrl.searchParams.keys()];
    if (queryKeys.length !== 1 || queryKeys[0] !== "actor") {
      sendJson(response, 400, safeError("invalid_request"));
      return;
    }
    const result = await readStatelessDemo(requestUrl.searchParams.get("actor"));
    sendJson(response, result.statusCode, result.body);
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, safeError("method_not_allowed"), { Allow: "GET, POST" });
    return;
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    sendJson(response, parsed.statusCode, parsed.error);
    return;
  }
  const result = await runStatelessDemo(parsed.value);
  sendJson(response, result.statusCode, result.body);
}

function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const absolute = resolve(STATIC_ROOT, relative.split("/").join(sep));
  const rootPrefix = STATIC_ROOT.endsWith(sep) ? STATIC_ROOT : `${STATIC_ROOT}${sep}`;
  if (!absolute.startsWith(rootPrefix) || !STATIC_CONTENT_TYPES.has(extname(absolute).toLowerCase())) {
    return null;
  }
  return absolute;
}

async function serveStatic(request, response, pathname) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    sendJson(response, 405, safeError("method_not_allowed"), { Allow: "GET, HEAD" });
    return;
  }
  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    sendJson(response, 404, safeError("not_found"));
    return;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("Not a file.");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": file.size,
      "Content-Type": STATIC_CONTENT_TYPES.get(extname(filePath).toLowerCase()),
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, safeError("not_found"));
  }
}

/** Starts the dependency-free, same-origin, in-memory hackathon demo server. */
export async function createDemoHttpServer({ host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  let runtime = createDemoRuntime();
  const replaceRuntime = () => {
    runtime = createDemoRuntime();
    return runtime;
  };
  const server = createServer(async (request, response) => {
    try {
      if (typeof request.url !== "string" || request.url.length > MAX_URL_LENGTH) {
        sendJson(response, 414, safeError("uri_too_long"));
        return;
      }
      const requestUrl = new URL(request.url, "http://demo.local");
      const { pathname } = requestUrl;

      if (pathname === "/api/responsibility") {
        await handleStateless(request, requestUrl, response);
        return;
      }
      if (pathname === "/api/demo/state") {
        if (request.method !== "GET") {
          sendJson(response, 405, safeError("method_not_allowed"), { Allow: "GET" });
          return;
        }
        await handleState(requestUrl, response, runtime);
        return;
      }
      if (pathname === "/api/demo/analyze") {
        if (request.method !== "POST") {
          sendJson(response, 405, safeError("method_not_allowed"), { Allow: "POST" });
          return;
        }
        await handleAnalyze(request, response, runtime);
        return;
      }
      if (pathname === "/api/demo/action") {
        if (request.method !== "POST") {
          sendJson(response, 405, safeError("method_not_allowed"), { Allow: "POST" });
          return;
        }
        await handleAction(request, response, runtime);
        return;
      }
      if (pathname === "/api/demo/reset") {
        if (request.method !== "POST") {
          sendJson(response, 405, safeError("method_not_allowed"), { Allow: "POST" });
          return;
        }
        await handleReset(request, response, replaceRuntime);
        return;
      }
      if (pathname.startsWith("/api/")) {
        sendJson(response, 404, safeError("not_found"));
        return;
      }
      if (requestUrl.search.length > 0) {
        sendJson(response, 400, safeError("invalid_request"));
        return;
      }
      await serveStatic(request, response, pathname);
    } catch {
      if (!response.headersSent) sendJson(response, 500, safeError("internal_error"));
      else response.destroy();
    }
  });

  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => {
      server.off("error", rejectPromise);
      resolvePromise();
    });
  });

  const address = server.address();
  if (!isRecord(address)) throw new Error("Demo server did not bind to a TCP address.");
  const url = `http://${host}:${address.port}`;
  return Object.freeze({
    server,
    url,
    close: () => new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => error ? rejectPromise(error) : resolvePromise());
    }),
  });
}

const launchedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (launchedDirectly) {
  const requestedPort = process.env.PORT === undefined ? DEFAULT_PORT : Number(process.env.PORT);
  if (!Number.isSafeInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
    throw new TypeError("PORT must be an integer between 0 and 65535.");
  }
  const demo = await createDemoHttpServer({ port: requestedPort });
  console.log(`We Remember demo: ${demo.url}`);
  console.log("Mode: demo_in_memory (no durable persistence or external delivery)");
}
