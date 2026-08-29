import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";


const [port, url, outputPrefix, durationValue] = process.argv.slice(2);
if (!port || !url || !outputPrefix || !durationValue) {
  throw new Error("Usage: node brand_animation_qa.mjs <cdp-port> <svg-url> <output-prefix> <duration-ms>");
}

const duration = Number(durationValue);
if (!Number.isFinite(duration) || duration < 4000 || duration > 5000) {
  throw new Error("Animation duration must be between 4000 and 5000 milliseconds");
}

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("Chrome DevTools Protocol exposed no page target");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    runtimeErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    return;
  }
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
await send("Emulation.setDeviceMetricsOverride", {
  width: 720,
  height: 180,
  deviceScaleFactor: 2,
  mobile: false,
  screenWidth: 720,
  screenHeight: 180,
});
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 250, g: 247, b: 242, a: 1 } });

const svgResponse = await fetch(url);
if (!svgResponse.ok) throw new Error(`SVG request failed: ${svgResponse.status}`);
const svgSource = await svgResponse.text();
const svgRootMatch = svgSource.match(/^<svg\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"[^>]*\bviewBox="([^"]+)"/);
if (!svgRootMatch) throw new Error("SVG root must declare numeric width, height, and viewBox");
const [, canvasWidthValue, canvasHeightValue, expectedViewBox] = svgRootMatch;
const canvasWidth = Number(canvasWidthValue);
const canvasHeight = Number(canvasHeightValue);
await send("Emulation.setDeviceMetricsOverride", {
  width: canvasWidth,
  height: canvasHeight,
  deviceScaleFactor: 2,
  mobile: false,
  screenWidth: canvasWidth,
  screenHeight: canvasHeight,
});

async function loadInlineSvg() {
  await send("Page.navigate", { url: "about:blank" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await evaluate(`(() => {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
    document.body.style.cssText = 'margin:0;width:${canvasWidth}px;height:${canvasHeight}px;overflow:hidden;background:#faf7f2';
    document.body.innerHTML = ${JSON.stringify(svgSource)};
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 20));
}

await loadInlineSvg();

const documentState = JSON.parse(await evaluate(`JSON.stringify({
  root: document.querySelector('svg')?.localName,
  viewBox: document.querySelector('svg')?.getAttribute('viewBox'),
  title: document.querySelector('svg title')?.textContent,
  scripts: document.querySelectorAll('svg script').length,
  images: document.querySelectorAll('svg image').length,
  typoCharCenter: (() => {
    const text = document.querySelector('.wr-fix-typo');
    if (!text) return null;
    const start = text.getStartPositionOfChar(6).x;
    const end = text.getEndPositionOfChar(6).x;
    return Math.round((start + end) * 100 / 2) / 100;
  })()
})`));
if (documentState.root !== "svg" || documentState.viewBox !== expectedViewBox || !documentState.title || documentState.scripts || documentState.images) {
  throw new Error(`Invalid rendered SVG: ${JSON.stringify(documentState)}`);
}

mkdirSync(dirname(outputPrefix), { recursive: true });
const frameTimes = [120, Math.round(duration * 0.36), Math.round(duration * 0.42), Math.round(duration * 0.58)];
const screenshots = [];
for (let index = 0; index < frameTimes.length; index += 1) {
  const targetTime = frameTimes[index];
  if (index > 0) await loadInlineSvg();
  await new Promise((resolve) => setTimeout(resolve, targetTime));
  const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const path = `${outputPrefix}-${index + 1}.png`;
  writeFileSync(path, Buffer.from(screenshot.data, "base64"));
  screenshots.push({ path, timeMs: targetTime });
}

await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await loadInlineSvg();
const reducedMotionState = JSON.parse(await evaluate(`JSON.stringify({
  finalOpacity: getComputedStyle(document.querySelector('.wr-context-top, .wr-fix-wordmark')).opacity,
  initialOpacity: getComputedStyle(document.querySelector('.wr-mom-o, .wr-fix-typo')).opacity,
  runningAnimations: document.getAnimations().length
})`));
if (reducedMotionState.finalOpacity !== "1" || reducedMotionState.initialOpacity !== "0" || reducedMotionState.runningAnimations !== 0) {
  throw new Error(`Invalid reduced-motion state: ${JSON.stringify(reducedMotionState)}`);
}

if (runtimeErrors.length) throw new Error(`SVG runtime errors: ${JSON.stringify(runtimeErrors)}`);
console.log(JSON.stringify({ status: "passed", url, duration, runtimeErrors, documentState, screenshots, reducedMotionState }, null, 2));
socket.close();
