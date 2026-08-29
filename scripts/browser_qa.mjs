import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";


const [port, url, widthValue, heightValue, screenshotPath] = process.argv.slice(2);
if (!port || !url || !widthValue || !heightValue || !screenshotPath) {
  throw new Error("Usage: node browser_qa.mjs <cdp-port> <url> <width> <height> <screenshot-path>");
}

const width = Number(widthValue);
const height = Number(heightValue);
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
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
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
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width <= 520,
  screenWidth: width,
  screenHeight: height,
});
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 800));

await evaluate(`(() => {
  const input = document.querySelector('#agent-input');
  input.value = '周六下午三点带妈妈复诊，提前一天提醒我和爸爸';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('#composer-form').requestSubmit();
  return true;
})()`);
await new Promise((resolve) => setTimeout(resolve, 600));

const draftReady = JSON.parse(await evaluate(`JSON.stringify({
  drafts: document.querySelectorAll('.draft-card').length,
  events: document.querySelectorAll('.timeline-event').length,
  receiptHidden: document.querySelector('#receipt-card').hidden,
  receiptVisible: getComputedStyle(document.querySelector('#receipt-card')).display !== 'none',
  voiceStateVisible: getComputedStyle(document.querySelector('#voice-state')).display !== 'none',
  confirmAboveComposer: document.querySelector('.confirm-draft').getBoundingClientRect().bottom <= document.querySelector('#composer-form').getBoundingClientRect().top
})`));
if (draftReady.drafts !== 1 || draftReady.events !== 2 || !draftReady.receiptHidden || draftReady.receiptVisible || draftReady.voiceStateVisible || !draftReady.confirmAboveComposer) {
  throw new Error(`Confirmation gate failed: ${JSON.stringify(draftReady)}`);
}

await evaluate("document.querySelector('.confirm-draft').click(); true");
await new Promise((resolve) => setTimeout(resolve, 250));

const metrics = JSON.parse(await evaluate(`JSON.stringify({
  viewportWidth: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  events: document.querySelectorAll('.timeline-event').length,
  receiptHidden: document.querySelector('#receipt-card').hidden,
  composerVisible: document.querySelector('#composer-form').getBoundingClientRect().bottom <= window.innerHeight,
  mobileNavVisible: getComputedStyle(document.querySelector('.mobile-nav')).display !== 'none',
  speechCapabilityChecked: typeof (window.SpeechRecognition || window.webkitSpeechRecognition) !== 'undefined'
})`));

if (metrics.scrollWidth > metrics.viewportWidth) {
  throw new Error(`Horizontal overflow: ${JSON.stringify(metrics)}`);
}
if (metrics.events !== 3 || metrics.receiptHidden || !metrics.composerVisible) {
  throw new Error(`Core journey failed: ${JSON.stringify(metrics)}`);
}
if ((width <= 520) !== metrics.mobileNavVisible) {
  throw new Error(`Responsive navigation failed: ${JSON.stringify(metrics)}`);
}

mkdirSync(dirname(screenshotPath), { recursive: true });
const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
console.log(JSON.stringify({ status: "passed", width, height, ...metrics }, null, 2));
socket.close();
