/* 用 CDP 驱动无头 Chrome 截图并采集页面度量。
   目的：真的看到渲染结果，并把溢出、字号、点击区这些硬指标量出来，而不是靠推测。
   用法：node qa/shot.mjs [演示步数]   步数默认 0（初始态）
   前置：先在 ui/app 目录起 http.server 5180 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:5180/";
const OUT = new URL("./", import.meta.url).pathname;
const step = Number(process.argv[2] || 0);
const PORT = 9300 + step;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  "--headless=new", "--hide-scrollbars",
  "--force-device-scale-factor=2", "--window-size=1680,1150",
  "--no-first-run", "--no-default-browser-check",
  /* 每次用全新 profile：复用会让磁盘缓存留住旧的 JS，改完看不到效果 */
  `--user-data-dir=/tmp/dujide-qa-${step}-${Date.now()}`, "about:blank",
], { stdio: "ignore" });

async function debuggerUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome 未就绪");
}

let seq = 0;
const pending = new Map();
function makeRpc(ws) {
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  });
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
}

const PROBE = `(() => {
  const out = { overflow: [], smallTargets: [], seniorFontPx: null, counts: {} };
  const sc = document.getElementById('scr');
  if (sc) {
    const w = sc.clientWidth;
    if (sc.scrollWidth > w + 1) out.overflow.push('屏幕自身 ' + sc.scrollWidth + '>' + w);
    sc.querySelectorAll('*').forEach(el => {
      /* 横向滚动容器（连接中心的接口行、路由条）允许溢出 */
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
      if (el.scrollWidth > w + 1) out.overflow.push((el.className || el.tagName) + ' ' + el.scrollWidth + '>' + w);
    });
  }
  const sen = document.querySelector('.screen.senior');
  if (sen) {
    out.seniorFontPx = getComputedStyle(sen).fontSize;
    /* 用 offsetWidth/Height 量布局像素：舞台为并排展示做了 transform:scale，
       getBoundingClientRect 会把缩放算进去，那不是真机上的实际尺寸 */
    sen.querySelectorAll('button').forEach(b => {
      const w = b.offsetWidth, h = b.offsetHeight;
      if (w > 0 && h > 0 && (h < 60 || w < 60)) {
        out.smallTargets.push((b.className || 'button') + ' ' + w + '×' + h);
      }
    });
  }
  out.counts.card = document.querySelectorAll('.card').length;
  out.counts.msg = document.querySelectorAll('.msg').length;
  out.counts.sheet = document.querySelectorAll('.sheet').length;
  out.counts.rem = document.querySelectorAll('.rem').length;
  out.counts.agenda = document.querySelectorAll('.arow').length;
  out.actor = document.querySelector('.actorbtn.on b')?.textContent ?? null;
  out.tab = document.querySelector('.tabbar button.on')?.textContent ?? null;
  out.remCount = document.getElementById('rem-count')?.textContent ?? null;
  out.jsErrors = window.__errs || [];
  /* 角色定性词禁出现在界面上（含舞台标注）*/
  const banned = ['primary','partner','subject','主责任人','被看护人','共同生活成员'];
  const text = document.body.innerText;
  out.bannedWords = banned.filter(w => text.includes(w));
  return JSON.stringify(out);
})()`;

const main = async () => {
  const ws = new WebSocket(await debuggerUrl());
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  const rpc = makeRpc(ws);

  const { targetId } = await rpc("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await rpc("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => rpc(m, p, sessionId);

  await S("Page.enable");
  await S("Runtime.enable");
  await S("Log.enable").catch(() => {});
  await S("Emulation.setDeviceMetricsOverride", { width: 1680, height: 1150, deviceScaleFactor: 2, mobile: false });
  await S("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__errs=[];addEventListener('error',e=>window.__errs.push(String(e.message)));",
  });
  await S("Page.navigate", { url: BASE });
  await sleep(1800);

  if (step > 0) {
    await S("Runtime.evaluate", {
      expression: `for(let i=0;i<${step};i++){document.getElementById('btn-next').click();}`,
    });
    await sleep(step >= 6 ? 4000 : 1400);
  }

  const r = await S("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  const metrics = JSON.parse(r.result.value);

  const shot = await S("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT + `step-${step}.png`, Buffer.from(shot.data, "base64"));

  console.log(JSON.stringify({ step, ...metrics }, null, 2));
  ws.close();
  chrome.kill();
};

main().catch((e) => { console.error("失败:", e.message); chrome.kill(); process.exit(1); });
