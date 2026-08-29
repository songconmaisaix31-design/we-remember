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
const runtimeErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    runtimeErrors.push(details.exception?.description || details.text || "Unknown runtime exception");
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    runtimeErrors.push(message.params.args.map((argument) => argument.value || argument.description).join(" "));
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

const openingState = JSON.parse(await evaluate(`JSON.stringify({
  present: document.querySelector('#brand-intro') !== null,
  visible: document.querySelector('#brand-intro') ? getComputedStyle(document.querySelector('#brand-intro')).display !== 'none' : false,
  animatedLogoLoaded: Boolean(document.querySelector('#brand-intro img')?.complete && document.querySelector('#brand-intro img')?.naturalWidth > 0),
  staticLogoSource: document.querySelector('.brand-logo')?.getAttribute('src'),
  staticLogoLoaded: Boolean(document.querySelector('.brand-logo')?.complete && document.querySelector('.brand-logo')?.naturalWidth > 0)
})`));
const expectsOpening = scenario !== "identity-reduced";
if (expectsOpening !== openingState.visible || (expectsOpening && !openingState.animatedLogoLoaded)
  || (!expectsOpening && openingState.present) || openingState.staticLogoSource !== "assets/brand/we-remember-logo.svg"
  || !openingState.staticLogoLoaded) {
  throw new Error(`Brand opening failed: ${JSON.stringify({ expectsOpening, openingState })}`);
}
if (scenario !== "opening" && scenario !== "opening-complete" && openingState.present) {
  await evaluate("document.querySelector('#brand-intro').dispatchEvent(new AnimationEvent('animationend')); true");
  await new Promise((resolve) => setTimeout(resolve, 30));
  if (await evaluate("document.querySelector('#brand-intro') !== null")) {
    throw new Error("Brand opening did not clean up after animation completion");
  }
}

async function assertDirectEntry() {
  const entry = JSON.parse(await evaluate(`JSON.stringify({
    appVisible: !document.querySelector('.app-shell')?.hidden,
    agentVisible: !document.querySelector('#agent-view')?.hidden,
    onboardingAbsent: document.querySelector('#auth-gate, #family-key-input, #avatar-step, #avatar-upload') === null,
    ready: document.body.dataset.sessionStatus === 'ready',
    defaultAvatar: document.querySelector('#profile-avatar')?.getAttribute('src'),
    roleAvatarCount: document.querySelectorAll('[data-role-avatar]').length,
    roleAvatarsLoaded: [...document.querySelectorAll('[data-role-avatar]')].every(image => image.complete && image.naturalWidth > 0),
    memberAvatarSources: [...document.querySelectorAll('#people-member-list [data-role-avatar]')].map(image => image.getAttribute('src'))
  })`));
  const expectedMemberAvatars = [
    'assets/family-work/mother/work.svg',
    'assets/family-work/mother/family.svg',
    'assets/family-work/father/family.svg',
    'assets/family-work/daughter/family.svg',
    'assets/family-work/son/family.svg',
    'assets/family-work/grandmother/family.svg'
  ];
  if (!entry.appVisible || !entry.agentVisible || !entry.onboardingAbsent || !entry.ready
    || entry.defaultAvatar !== expectedMemberAvatars[0] || entry.roleAvatarCount !== 11
    || !entry.roleAvatarsLoaded || JSON.stringify(entry.memberAvatarSources) !== JSON.stringify(expectedMemberAvatars)) {
    throw new Error(`Direct entry failed: ${JSON.stringify(entry)}`);
  }
  return entry;
}

function assertNoRuntimeErrors() {
  if (runtimeErrors.length > 0) {
    throw new Error(`JavaScript runtime errors: ${JSON.stringify(runtimeErrors)}`);
  }
}

async function captureResult(payload) {
  assertNoRuntimeErrors();
  mkdirSync(dirname(screenshotPath), { recursive: true });
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify({ status: "passed", scenario, width, height, runtimeErrors, ...payload }, null, 2));
  socket.close();
}

async function openView(viewName) {
  const navigation = JSON.parse(await evaluate(`(() => {
    const candidates = [...document.querySelectorAll('[data-view="${viewName}"]')];
    const control = candidates.find(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || candidates[0];
    if (!control) return JSON.stringify({ clicked: false });
    control.click();
    return JSON.stringify({ clicked: true });
  })()`));
  if (!navigation.clicked) throw new Error(`Missing navigation control for ${viewName}`);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function assertViewState(viewName) {
  const state = JSON.parse(await evaluate(`JSON.stringify((() => {
    const destination = document.querySelector('#${viewName}-view');
    const destinationRect = destination?.getBoundingClientRect();
    const visibleControls = [...document.querySelectorAll('[data-view="${viewName}"]')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return {
      destinationVisible: Boolean(destination && !destination.hidden && destinationRect.width > 0 && destinationRect.height > 0),
      titled: Boolean(destination?.querySelector('h1, h2')),
      activeControls: visibleControls.length,
      currentSemantics: visibleControls.length > 0 && visibleControls.every(element => element.getAttribute('aria-current') === 'page'),
      staleCurrentControls: [...document.querySelectorAll('[data-view]:not([data-view="${viewName}"])')].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && element.hasAttribute('aria-current');
      }).length
    };
  })())`));
  if (!state.destinationVisible || !state.titled || state.activeControls < 1 || !state.currentSemantics || state.staleCurrentControls !== 0) {
    throw new Error(`${viewName} view routing failed: ${JSON.stringify(state)}`);
  }
  return state;
}

async function assertResponsiveLayout(primarySelector) {
  const layout = JSON.parse(await evaluate(`(async () => {
    const primary = [...document.querySelectorAll(${JSON.stringify(primarySelector)})].find(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    primary?.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const primaryRect = primary?.getBoundingClientRect();
    const mobileNav = document.querySelector('.mobile-nav');
    const navRect = mobileNav?.getBoundingClientRect();
    const navVisible = Boolean(navRect && navRect.width > 0 && navRect.height > 0);
    const mobilePrimaryReachable = ${width <= 520} ? Boolean(
      primaryRect && navVisible && primaryRect.top >= 0 && primaryRect.bottom <= navRect.top - 4
    ) : true;
    return JSON.stringify({
      viewportWidth: window.innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      primaryVisible: Boolean(primaryRect && primaryRect.width > 0 && primaryRect.height > 0),
      navVisible,
      mobilePrimaryReachable
    });
  })()`));
  if (layout.scrollWidth > layout.viewportWidth || !layout.primaryVisible || !layout.mobilePrimaryReachable) {
    throw new Error(`Responsive layout failed for ${primarySelector}: ${JSON.stringify(layout)}`);
  }
  return layout;
}

async function createAndConfirmRepresentativeDraft() {
  await openView("agent");
  const before = JSON.parse(await evaluate(`JSON.stringify({
    scheduleItems: document.querySelector('#schedule-event-list').children.length,
    receiptItems: document.querySelector('#notification-receipt-list').children.length,
    todayItems: document.querySelectorAll('#timeline .timeline-event').length
  })`));
  await evaluate(`(() => {
    const input = document.querySelector('#agent-input');
    input.value = '周六下午三点带妈妈复诊，提前一天提醒我和爸爸';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#composer-form').requestSubmit();
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 600));

  const pendingDraft = JSON.parse(await evaluate(`JSON.stringify({
    drafts: document.querySelectorAll('.draft-card').length,
    scheduleItems: document.querySelector('#schedule-event-list').children.length,
    receiptItems: document.querySelector('#notification-receipt-list').children.length,
    todayItems: document.querySelectorAll('#timeline .timeline-event').length
  })`));
  if (
    pendingDraft.drafts !== 1 ||
    pendingDraft.scheduleItems !== before.scheduleItems ||
    pendingDraft.receiptItems !== before.receiptItems ||
    pendingDraft.todayItems !== before.todayItems
  ) {
    throw new Error(`Pending draft changed shared state: ${JSON.stringify({ before, pendingDraft })}`);
  }

  await evaluate("document.querySelector('.confirm-draft').click(); true");
  await new Promise((resolve) => setTimeout(resolve, 250));
  const confirmed = JSON.parse(await evaluate(`JSON.stringify({
    scheduleItems: document.querySelector('#schedule-event-list').children.length,
    scheduleText: document.querySelector('#schedule-event-list').textContent,
    receiptItems: document.querySelector('#notification-receipt-list').children.length,
    receiptText: document.querySelector('#notification-receipt-list').textContent,
    matchingReceipts: [...document.querySelector('#notification-receipt-list').children].filter(item => item.textContent.includes('复诊')).length,
    fatherReceipt: [...document.querySelector('#notification-receipt-list').children].some(item => item.textContent.includes('复诊') && item.textContent.includes('爸爸')),
    selfReceipt: [...document.querySelector('#notification-receipt-list').children].some(item => item.textContent.includes('复诊') && item.textContent.includes('我')),
    todayItems: document.querySelectorAll('#timeline .timeline-event').length
  })`));
  if (
    confirmed.scheduleItems <= before.scheduleItems ||
    confirmed.receiptItems <= before.receiptItems ||
    confirmed.todayItems <= before.todayItems ||
    !confirmed.scheduleText.includes('带妈妈复诊') ||
    confirmed.matchingReceipts < 2 ||
    !confirmed.fatherReceipt ||
    !confirmed.selfReceipt
  ) {
    throw new Error(`Confirmed draft did not synchronize shared views: ${JSON.stringify({ before, confirmed })}`);
  }
  return { before, pendingDraft, confirmed };
}

async function exerciseFilter(selector, label) {
  const result = JSON.parse(await evaluate(`(() => {
    const controls = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(control => !control.disabled);
    const hasAriaSelection = control => control.getAttribute('aria-pressed') === 'true' ||
      control.getAttribute('aria-selected') === 'true' || control.hasAttribute('aria-current');
    const visualToken = control => {
      const style = getComputedStyle(control);
      return [style.backgroundColor, style.color, style.borderColor, style.boxShadow, style.fontWeight].join('|');
    };
    const initiallySelected = controls.filter(hasAriaSelection);
    const target = controls.find(control => !hasAriaSelection(control));
    target?.click();
    const selectedAfter = controls.filter(hasAriaSelection);
    const comparison = controls.find(control => control !== target && !hasAriaSelection(control));
    return JSON.stringify({
      controls: controls.length,
      initiallySelected: initiallySelected.length,
      targetSelected: Boolean(target && hasAriaSelection(target)),
      targetVisuallySelected: Boolean(target && comparison && visualToken(target) !== visualToken(comparison)),
      selectedAfter: selectedAfter.length
    });
  })()`));
  if (result.controls < 2 || result.initiallySelected !== 1 || !result.targetSelected || !result.targetVisuallySelected || result.selectedAfter !== 1) {
    throw new Error(`${label} selection semantics failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function exerciseSelect(selector, label) {
  const result = JSON.parse(await evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    const options = [...control.options].filter(option => !option.disabled);
    const initialValue = control.value;
    const initialRows = document.querySelector('#schedule-event-list').children.length;
    const target = options.find(option => option.value !== initialValue);
    control.value = target?.value ?? initialValue;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return JSON.stringify({
      options: options.length,
      initialValue,
      selectedValue: control.value,
      selectedLabel: control.selectedOptions[0]?.textContent.trim() ?? '',
      rowsChanged: document.querySelector('#schedule-event-list').children.length !== initialRows
    });
  })()`));
  if (result.options < 2 || result.selectedValue === result.initialValue || !result.selectedLabel || !result.rowsChanged) {
    throw new Error(`${label} selection semantics failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function assertContainerExperience(selector, minimumRadius, minimumPadding, label) {
  const before = JSON.parse(await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return JSON.stringify({
      x: rect.left + rect.width / 2,
      y: rect.top + Math.min(rect.height / 2, 80),
      radius: parseFloat(style.borderTopLeftRadius),
      padding: parseFloat(style.paddingTop),
      transform: style.transform,
      shadow: style.boxShadow
    });
  })()`));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: before.x, y: before.y });
  await new Promise((resolve) => setTimeout(resolve, 280));
  const after = JSON.parse(await evaluate(`(() => {
    const style = getComputedStyle(document.querySelector(${JSON.stringify(selector)}));
    return JSON.stringify({ transform: style.transform, shadow: style.boxShadow });
  })()`));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  if (before.radius < minimumRadius || before.padding < minimumPadding || after.transform === before.transform || after.shadow === before.shadow) {
    throw new Error(`${label} container experience failed: ${JSON.stringify({ before, after })}`);
  }
  return { radius: before.radius, padding: before.padding, lifted: true, shadowChanged: true };
}

const directEntry = await assertDirectEntry();

if (scenario === "opening") {
  await captureResult({ openingState, directEntry });
  process.exit(0);
}

if (scenario === "opening-complete") {
  await new Promise((resolve) => setTimeout(resolve, 4300));
  const completion = JSON.parse(await evaluate(`JSON.stringify({
    openingRemoved: document.querySelector('#brand-intro') === null,
    scrollLockRemoved: !document.body.classList.contains('has-brand-intro')
  })`));
  if (!completion.openingRemoved || !completion.scrollLockRemoved) {
    throw new Error(`Brand opening completion failed: ${JSON.stringify(completion)}`);
  }
  await captureResult({ openingState, completion, directEntry });
  process.exit(0);
}

if (scenario === "identity" || scenario === "identity-reduced") {
  await captureResult({ openingState, directEntry });
  process.exit(0);
}

if (scenario === "schedule" || scenario === "people") {
  const synchronization = await createAndConfirmRepresentativeDraft();

  await openView("schedule");
  const scheduleView = await assertViewState("schedule");
  const scheduleSync = JSON.parse(await evaluate(`JSON.stringify({
    confirmedEventVisible: document.querySelector('#schedule-event-list').textContent.includes('带妈妈复诊'),
    createActions: document.querySelectorAll('#schedule-view [data-create-with-agent]').length
  })`));
  if (!scheduleSync.confirmedEventVisible || scheduleSync.createActions < 1) {
    throw new Error(`Schedule shared state failed: ${JSON.stringify(scheduleSync)}`);
  }
  const dayFilter = await exerciseSelect("#schedule-day-filter", "Schedule day filter");
  const memberFilter = await exerciseFilter("[data-member-filter]", "Schedule member filter");
  const scheduleLayout = await assertResponsiveLayout("#schedule-view [data-create-with-agent]");
  const scheduleContainer = await assertContainerExperience("#schedule-view .schedule-panel", width <= 520 ? 26 : 28, width <= 520 ? 20 : 28, "Schedule");

  await openView("people");
  const peopleView = await assertViewState("people");
  const peopleSync = JSON.parse(await evaluate(`JSON.stringify({
    members: document.querySelector('#people-member-list').children.length,
    confirmedReceiptVisible: document.querySelector('#notification-receipt-list').textContent.includes('复诊') && document.querySelector('#notification-receipt-list').textContent.includes('爸爸'),
    createActions: document.querySelectorAll('#people-view [data-create-with-agent]').length
  })`));
  if (peopleSync.members < 6 || !peopleSync.confirmedReceiptVisible || peopleSync.createActions < 1) {
    throw new Error(`People and notification shared state failed: ${JSON.stringify(peopleSync)}`);
  }
  const peopleLayout = await assertResponsiveLayout("#people-view [data-create-with-agent]");
  const peopleContainer = await assertContainerExperience("#people-view .people-panel", width <= 520 ? 26 : 28, width <= 520 ? 20 : 28, "People");

  if (scenario === "schedule") {
    await openView("schedule");
  }
  const routeSelector = scenario === "schedule"
    ? "#schedule-view [data-create-with-agent]"
    : "#people-view [data-create-with-agent]";
  await evaluate(`document.querySelector(${JSON.stringify(routeSelector)}).click(); true`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const agentReturn = await assertViewState("agent");
  await openView(scenario);
  await assertViewState(scenario);
  await new Promise((resolve) => setTimeout(resolve, 2400));

  await captureResult({
    synchronization,
    scheduleView,
    scheduleSync,
    dayFilter,
    memberFilter,
    scheduleLayout,
    scheduleContainer,
    peopleView,
    peopleSync,
    peopleLayout,
    peopleContainer,
    agentReturn,
  });
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

  await captureResult(metrics);
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
  events: document.querySelectorAll('#timeline .timeline-event').length,
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
  events: document.querySelectorAll('#timeline .timeline-event').length,
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

await captureResult(metrics);
