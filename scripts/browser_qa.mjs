import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";


const [port, url, widthValue, heightValue, screenshotPath, scenario = "conversation"] = process.argv.slice(2);
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
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: scenario === "identity-reduced" ? "reduce" : "no-preference" }],
});
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 800));

async function completeDemoSignIn(role = "mother") {
  const signedIn = await evaluate("!document.querySelector('.app-shell').hidden");
  if (signedIn) return;
  await evaluate(`(() => {
    document.querySelector('#feishu-sign-in').click();
    document.querySelector('#show-no-match').click();
    return true;
  })()`);
  const noMatchSafe = await evaluate("!document.querySelector('#no-match-state').hidden && document.querySelector('#continue-to-avatar').disabled");
  if (!noMatchSafe) throw new Error("Unbound Feishu identity did not fail closed");

  await evaluate(`(() => {
    document.querySelector('#hide-no-match').click();
    document.querySelector('[data-space-id="family-home"]').click();
    document.querySelector('#continue-to-avatar').click();
    document.querySelector('[data-role="${role}"]').click();
    document.querySelector('#enter-family-space').click();
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 250));
}

if (scenario === "identity" || scenario === "identity-reduced") {
  const reducedMotion = scenario === "identity-reduced";
  if (reducedMotion) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  }
  await evaluate("sessionStorage.removeItem('we-remember-demo-session-v1'); true");
  await send("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, 500));

  const signedOut = JSON.parse(await evaluate(`JSON.stringify({
    gateVisible: !document.querySelector('#auth-gate').hidden,
    appHidden: document.querySelector('.app-shell').hidden,
    loginCurrent: document.querySelector('[data-auth-progress="login"]').classList.contains('is-current')
  })`));
  if (!signedOut.gateVisible || !signedOut.appHidden || !signedOut.loginCurrent) {
    throw new Error(`Signed-out gate failed: ${JSON.stringify(signedOut)}`);
  }

  await evaluate(`(() => {
    document.querySelector('#feishu-sign-in').click();
    document.querySelector('#show-no-match').click();
    return true;
  })()`);
  const noMatchSafe = await evaluate("!document.querySelector('#no-match-state').hidden && document.querySelector('#continue-to-avatar').disabled");
  if (!noMatchSafe) throw new Error("Unbound Feishu identity did not fail closed");

  await evaluate(`(() => {
    document.querySelector('#hide-no-match').click();
    document.querySelector('[data-space-id="family-home"]').click();
    document.querySelector('#continue-to-avatar').click();
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 200));

  const picker = JSON.parse(await evaluate(`JSON.stringify({
    roleCount: document.querySelectorAll('.role-option').length,
    roleImagesReady: [...document.querySelectorAll('.role-option img')].every((image) => image.complete && image.naturalWidth > 0),
    avatarStepVisible: !document.querySelector('#avatar-step').hidden,
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  })`));
  if (picker.roleCount !== 6 || !picker.roleImagesReady || !picker.avatarStepVisible || picker.scrollWidth > picker.viewportWidth) {
    throw new Error(`Avatar picker failed: ${JSON.stringify(picker)}`);
  }

  if (width <= 520) {
    const actionReachable = await evaluate(`(() => {
      const action = document.querySelector('#enter-family-space');
      action.scrollIntoView({ block: 'center' });
      const rect = action.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    })()`);
    if (!actionReachable) throw new Error("Mobile avatar confirmation cannot be reached by scrolling");
  }

  mkdirSync(dirname(screenshotPath), { recursive: true });
  const pickerScreenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(pickerScreenshot.data, "base64"));

  await evaluate(`(() => {
    document.querySelector('[data-role="grandmother"]').click();
    document.querySelector('#enter-family-space').click();
    document.querySelector('#mode-switch').click();
    return true;
  })()`);
  const forwardPath = await evaluate("document.querySelector('#profile-avatar').getAttribute('src')");
  if (reducedMotion) {
    if (!forwardPath.endsWith("grandmother/work.svg")) throw new Error(`Reduced-motion work endpoint missing: ${forwardPath}`);
  } else {
    if (!forwardPath.includes("grandmother/family-to-work.svg")) throw new Error(`Forward transition missing: ${forwardPath}`);
    await new Promise((resolve) => setTimeout(resolve, 2600));
  }
  const workPath = await evaluate("document.querySelector('#profile-avatar').getAttribute('src')");
  if (!workPath.endsWith("grandmother/work.svg")) throw new Error(`Work endpoint missing: ${workPath}`);

  await send("Page.reload");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const restored = JSON.parse(await evaluate(`JSON.stringify({
    appVisible: !document.querySelector('.app-shell').hidden,
    mode: document.querySelector('.app-shell').dataset.visualMode,
    role: document.querySelector('#profile-role').textContent
  })`));
  if (!restored.appVisible || restored.mode !== "work" || restored.role !== "奶奶") {
    throw new Error(`Session restore failed: ${JSON.stringify(restored)}`);
  }

  await evaluate("document.querySelector('#mode-switch').click(); true");
  const reversePath = await evaluate("document.querySelector('#profile-avatar').getAttribute('src')");
  if (reducedMotion) {
    if (!reversePath.endsWith("grandmother/family.svg")) throw new Error(`Reduced-motion family endpoint missing: ${reversePath}`);
  } else {
    if (!reversePath.includes("grandmother/work-to-family.svg")) throw new Error(`Reverse transition missing: ${reversePath}`);
    await new Promise((resolve) => setTimeout(resolve, 2600));
  }
  await evaluate("document.querySelector('#sign-out-button').click(); true");
  const signedOutAgain = await evaluate("!document.querySelector('#auth-gate').hidden && document.querySelector('.app-shell').hidden");
  if (!signedOutAgain) throw new Error("Sign-out did not restore the login gate");

  console.log(JSON.stringify({ status: "passed", scenario, width, height, reducedMotion, noMatchSafe, ...picker, forwardPath, workPath, reversePath, restored, signedOutAgain }, null, 2));
  socket.close();
  process.exit(0);
}

await completeDemoSignIn();

if (scenario === "workspace") {
  const currentMode = await evaluate("document.querySelector('.app-shell').dataset.visualMode");
  if (currentMode !== "family") await evaluate("document.querySelector('#mode-switch').click(); true");
  await new Promise((resolve) => setTimeout(resolve, 2600));
  await evaluate("document.querySelector('#mode-switch').click(); true");
  await new Promise((resolve) => setTimeout(resolve, 2600));

  const metrics = JSON.parse(await evaluate(`JSON.stringify({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    mode: document.querySelector('.app-shell').dataset.visualMode,
    noticeVisible: !document.querySelector('#mode-notice').hidden,
    workEndpoint: document.querySelector('#profile-avatar').getAttribute('src').endsWith('/work.svg'),
    switchLabel: document.querySelector('#mode-switch-label').textContent
  })`));
  if (metrics.scrollWidth > metrics.viewportWidth || metrics.mode !== "work" || !metrics.noticeVisible || !metrics.workEndpoint || metrics.switchLabel !== "工作空间") {
    throw new Error(`Work workspace failed: ${JSON.stringify(metrics)}`);
  }

  mkdirSync(dirname(screenshotPath), { recursive: true });
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify({ status: "passed", scenario, width, height, ...metrics }, null, 2));
  socket.close();
  process.exit(0);
}

if (scenario === "integrations") {
  await evaluate(`(() => {
    document.querySelector('[data-view="integrations"]').click();
    document.querySelector('[data-channel-detail="custom-bot"]').click();
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const metrics = JSON.parse(await evaluate(`JSON.stringify({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    dialogOpen: document.querySelector('#integrations-dialog').open,
    channelCards: document.querySelectorAll('.channel-card').length,
    customDetailVisible: getComputedStyle(document.querySelector('[data-detail="custom-bot"]')).display !== 'none',
    endpointVisible: document.querySelector('.endpoint-preview').getBoundingClientRect().width > 0,
    personalWechatSeparated: document.querySelector('[data-channel="wecom"]') !== null && document.querySelector('[data-channel="wechat-clawbot"]') !== null,
    clawBotDirectOnly: document.body.textContent.includes('不含微信群'),
    mobileColumns: getComputedStyle(document.querySelector('.channel-grid')).gridTemplateColumns.split(' ').length
  })`));
  if (metrics.scrollWidth > metrics.viewportWidth || !metrics.dialogOpen || metrics.channelCards !== 5 || !metrics.customDetailVisible || !metrics.endpointVisible || !metrics.personalWechatSeparated || !metrics.clawBotDirectOnly) {
    throw new Error(`Integration center failed: ${JSON.stringify(metrics)}`);
  }
  if (width <= 520 && metrics.mobileColumns !== 1) {
    throw new Error(`Mobile integration layout failed: ${JSON.stringify(metrics)}`);
  }
  if (width <= 520) {
    const bottomVisible = await evaluate(`(() => {
      const shell = document.querySelector('.integrations-shell');
      shell.scrollTop = shell.scrollHeight;
      const card = document.querySelector('[data-channel="custom-bot"]');
      const rect = card.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (!bottomVisible) throw new Error("Mobile custom-bot card cannot be reached by scrolling");
  }

  mkdirSync(dirname(screenshotPath), { recursive: true });
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify({ status: "passed", scenario, width, height, ...metrics }, null, 2));
  socket.close();
  process.exit(0);
}

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
