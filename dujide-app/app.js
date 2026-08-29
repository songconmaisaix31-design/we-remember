"use strict";
/* ═══════════════════════════════════════════════════════════════════════════
   《都记得》· 渲染与交互
   一部手机，三个功能页：
     对话  —— 落地页。没进家之前就是个普通助手；进了家可以切到家庭群
     家里  —— 进去要先输密钥。解锁后是家庭待办表 + 我负责的
     连接  —— 连接中心。V1 只做个人微信和第三方机器人
   界面上没有任何责任身份词，唯一的身份词是家庭称谓（PRD 6.5）。
   ═══════════════════════════════════════════════════════════════════════════ */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const A = (act, extra = "") => `data-act="${act}" ${extra}`;
const me = () => S.actor;
const U = () => S.ui[S.actor];

const ICON = {
  chat: '<svg viewBox="0 0 24 24"><path d="M20.8 11.7a8.2 8.2 0 1 1-4.2-7.1"/><path d="M3.4 20.6 4.9 16"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 9.6 12 3.2l9 6.4V21H3z"/><path d="M9.2 21v-6.6h5.6V21"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
};
const TABS = [
  { k: "chat", n: "对话", i: "chat" },
  { k: "home", n: "家里", i: "home" },
  { k: "link", n: "连接", i: "link" },
];

const FORM_LABEL = { map: "责任地图", duty: "我负责的", talk: "对话" };
const FORM_DESC = {
  map: "先看这周哪些事一直只有你在记得，再看全家的待办表",
  duty: "只看我负责的那几块，和等我确认的交接",
  talk: "不看这些，只要一个对话框，字大一点",
};

/* ═══════════════════════════════ 外壳 ═══════════════════════════════ */
const statusbar = () =>
  `<div class="statusbar"><span>9:41</span><span class="r">●●●&nbsp;&nbsp;⏻ 84%</span></div>`;

function navbar(title, sub, o = {}) {
  return `<div class="navbar">
    <button class="nb" ${o.back ? A(o.back) : "disabled"} aria-label="返回">${o.back ? "‹" : ""}</button>
    <div class="nt">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ""}</div>
    <button class="nr" ${o.more ? A(o.more) : "disabled"} aria-label="更多">${o.more ? "⋯" : ""}</button>
  </div>`;
}

function tabbar() {
  const u = U();
  return `<div class="tabbar">${TABS.map((t) => {
    const dot = (t.k === "home" && homeBadge()) || (t.k === "chat" && u.unreadChat);
    return `<button class="${t.k === u.tab ? "on" : ""}" ${A("tab", `data-tab="${t.k}"`)}>
      <span class="${dot ? "badge" : ""}">${ICON[t.i]}</span>${t.n}</button>`;
  }).join("")}</div>`;
}
function homeBadge() {
  if (!S.joined[me()]) return 0;
  const h = S.handovers.filter((x) => x.toId === me() && !x.toConfirmedAt && x.status !== "declined").length;
  const c = S.careEvents.filter((x) => x.state === "ack_timeout" || x.state.startsWith("escalated")).length;
  return h + c;
}
const toastEl = () => (U().toast ? `<div class="toast" role="status">${esc(U().toast)}</div>` : "");

/* 「只要一个对话框」那种版式：没有标签栏、没有嵌套导航（PRD 6.2） */
const isTalkOnly = () => S.joined[me()] && familyForm(me()) === "talk";

function screen() {
  const u = U();
  if (isTalkOnly()) {
    const cid = dmOf(me()).id;
    return statusbar()
      + navbar("记得", S.flags.familyLayer[me()] ? "随时说话 · 家里的事我也帮你记着" : "随时说话 · 只聊天，不记事", { more: "sheet:settings" })
      + `<div class="body chat" id="body">${renderChat(cid)}</div>`
      + composer(cid) + sheet() + toastEl();
  }

  const body = { chat: chatTab, home: homeTab, link: linkTab }[u.tab]();
  return statusbar() + navbarFor() + `<div class="body ${u.tab === "chat" && u.convo ? "chat" : ""}" id="body">${body}</div>`
    + (u.tab === "chat" && u.convo ? composer(u.convo) : "") + tabbar() + sheet() + toastEl();
}

function navbarFor() {
  const u = U();
  if (u.tab === "chat") {
    if (!u.convo) return navbar("对话", "");
    const c = convoOf(u.convo);
    const canSwitch = S.joined[me()];
    return navbar(convoTitle(c), convoSub(c), { back: canSwitch ? "backconvo" : null, more: "sheet:settings" });
  }
  if (u.tab === "home") return navbar("家里", S.joined[me()] ? `${SPACE.name} · ${ORDER.length} 位成员` : "还没进家");
  return navbar("连接", "让记得在常用聊天工具里工作");
}

/* ═══════════════════════════════ 页一：对话 ═══════════════════════════════
   没进家之前只有一个 1:1，就是个普通助手。
   进家之后多出家庭群，可以切。 */
function chatTab() {
  const u = U();
  if (u.convo) return renderChat(u.convo);

  /* 会话列表只在「已进家」时才有意义 —— 否则只有一个对话，直接进去 */
  return `
  <div class="card flat">
    <div class="card-h"><div><h3 style="font-size:14.5px">记得先是个普通助手</h3>
      <div class="sub">本周 ${S.stats.generalTurns} 轮只是随口聊聊，没有记进家里。
      只有被认出是家里的事、而且你同意了，才会留下来。</div></div></div>
  </div>
  <div class="chatlist">
    <button class="row" ${A("openconvo", `data-convo="${dmOf(me()).id}"`)}>
      <span class="avatar ai">记</span>
      <div class="t"><b>记得</b><span>${esc(lastText(dmOf(me()).id))}</span></div>
    </button>
    ${S.joined[me()] ? `
    <button class="row" ${A("openconvo", 'data-convo="family"')}>
      <span class="avatar">${esc(SPACE.name[0])}</span>
      <div class="t"><b>${esc(SPACE.name)}</b><span>${esc(lastText("family"))}</span></div>
    </button>` : `
    <div class="lockhint">
      <b>进了家才有家庭群</b>
      在「家里」那一页输入密钥，就能和家人一起说话，Agent 也会在群里发提醒。
    </div>`}
  </div>`;
}

const convoTitle = (c) => (c.type === "agent_dm" ? "记得" : SPACE.name);
const convoSub = (c) => (c.type === "agent_dm"
  ? (S.joined[me()] ? "普通助手 + 家里的事" : "普通助手")
  : `${c.members.length} 位成员 + 记得`);

function lastText(cid) {
  const list = (S.chats[cid] || []).filter((m) => !m.t && (!m.vis || canSee(me(), m.vis, m.from)));
  const m = list[list.length - 1];
  if (!m) return "还没有消息";
  if (m.kind === "card") return "[卡片] " + (CARD_SUMMARY[m.card] || "");
  return (m.from === "agent" ? "" : roleName(m.from) + "：") + m.text;
}
const CARD_SUMMARY = {
  consent: "要不要告诉家里人？", ruleDraft: "帮你记着这件事？", handover: "一整块责任的交接",
  report: "本周责任集中度", careNotify: "该吃药了", escalate: "还没有回应",
  layerInfo: "记下来了", announce: "客厅播报",
};

/* ═══════════════════════════════ 页二：家里 ═══════════════════════════════ */
function homeTab() {
  if (!S.joined[me()]) return keyGate();
  const form = familyForm(me());
  return form === "map" ? mapView() : dutyView();
}

/* 密钥门：加入一个家只有这条路（PRD 4.1.2） */
function keyGate() {
  const u = U();
  return `
  <div class="gate">
    <div class="gatehead">
      <span class="gateicon" aria-hidden="true">钥</span>
      <h2>你还没有家</h2>
      <p>加入一个家只有一条路：家里人私下给你密钥。<br />我们不搜手机号，也不读通讯录。</p>
    </div>
    <div class="card">
      <label class="keyfield"><span>家庭密钥</span>
        <input id="keyin" value="${esc(u.keyInput)}" placeholder="例如 DEMO-HOME" autocomplete="off" spellcheck="false" /></label>
      ${u.keyErr ? `<p class="keyerr" role="alert">没有匹配到。检查一下，或者找家里人重新给一个。</p>` : ""}
      <button class="act pri" ${A("keysubmit")}>进这个家</button>
      <p class="fixture">DEMO-HOME 是公开演示码，不是真实密钥</p>
    </div>
    <div class="card flat">
      <div class="card-h"><div><h3 style="font-size:14.5px">进家之后会多出什么</h3></div></div>
      <ul class="gatelist">
        <li>能看到全家的待办表，知道哪些事还没人管</li>
        <li>能和家人在群里说话，Agent 在群里发提醒</li>
        <li>你随口说的家里的事，会先问你要不要告诉家里人</li>
      </ul>
      <p class="fixture" style="text-align:left">密钥只让你进这一个家。它不会自动给你任何身份，也不读你以前的聊天。</p>
    </div>
  </div>`;
}

/* ── 家庭页 · 责任地图版式：先点出痛点，再给待办表 ─────────────────────── */
function mapView() {
  const rem = onlyIRemember(me());
  const r = weeklyReport();
  const doms = S.domains.filter((d) => canSeeDomain(me(), d));
  const ownerless = doms.filter((d) => !d.ownerId);

  return `
  <div class="hero">
    <p class="q">这周，有哪些事<br />一直只有你在记得？</p>
    <div class="cnt ${rem.length <= 2 ? "calm" : ""}">
      <b id="rem-count">${rem.length}</b><span>件事的发现、记时间、<br />安排和跟进都在你身上</span>
    </div>
    ${S.flags.handoverDone ? `<span class="delta">↓ 交接后从 ${S.flags.remBefore} 件降到 ${rem.length} 件</span>` : ""}
  </div>

  ${rem.length ? `<div class="remember">${rem.map((t) => {
    const d = domainOf(t.domainId);
    return `<div class="rem"><i class="dot"></i>
      <div class="t">${esc(t.title)}<small>${esc(d ? d.name : "")}</small></div>
      ${t.dueAt ? `<span class="due">${esc(t.dueAt)}</span>` : ""}</div>`;
  }).join("")}</div>` : `<div class="empty"><div class="ei">◠</div><p><b>没有只有你在记得的事了</b>
    每一块都有人管着。</p></div>`}

  ${ownerless.length ? `<p class="sec-label">还没有人管的 · ${ownerless.length}</p>
    ${ownerless.map(domainCard).join("")}` : ""}

  ${agendaBlock()}

  <p class="sec-label">我负责的 · ${domainsOwnedBy(me()).length}</p>
  ${domainsOwnedBy(me()).length ? domainsOwnedBy(me()).map(domainCard).join("")
    : `<div class="empty" style="padding:26px 20px"><p>这一栏还是空的。</p></div>`}

  <p class="sec-label">本周</p>
  <button class="card" ${A("sheet:report")} style="width:100%;text-align:left">
    <div class="card-h"><div><h3>责任集中度</h3>
      <div class="sub">由 ${S.tasks.filter((t) => t.inWeek).length} 条本周任务的五阶段字段统计</div></div>
      <span class="pill ${r.concentration >= 80 ? "hot" : "ok"}">${r.concentration}% 集中</span></div>
    <div class="loadcap"><span>你承担的活儿里看不见的占 ${r.invisibleShare(me())}%</span>
      <span>没人管的 ${r.ownerless} 块</span></div>
  </button>
  ${formSwitch()}`;
}

/* ── 家庭页 · 我负责的版式 ───────────────────────────────────────────────── */
function dutyView() {
  const owned = domainsOwnedBy(me());
  const inbox = S.handovers.filter((h) => h.toId === me() && h.status !== "declined" && !h.toConfirmedAt);
  const rules = S.careRules.filter((r) => r.primaryCaregiverId === me() && r.status === "active");

  return `
  ${inbox.length ? `<p class="sec-label">等你确认的交接 · ${inbox.length}</p>
    ${inbox.map(handoverInbox).join("")}` : ""}

  <p class="sec-label">我负责的 · ${owned.length}</p>
  ${owned.length ? owned.map(domainCard).join("") : `
    <div class="empty"><div class="ei">◇</div><p><b>你还没有担起一整块</b>
    做过的具体事情不算。一整块包含发现、记住时间、安排和跟进。</p></div>`}

  ${agendaBlock()}

  ${rules.length ? `<p class="sec-label">我在帮着记的</p>${rules.map(careCard).join("")}` : ""}

  ${rules.length ? `<button class="card flat" ${A("dadaway")} style="width:100%;text-align:left">
    <div class="card-h"><div><h3>${S.flags.dadAway ? "我已经回来了" : "我现在有急事"}</h3>
    <div class="sub">${S.flags.dadAway
      ? "这段时间的提醒已经直接发给奶奶，点这里恢复"
      : "临时把这段时间交出去，Agent 会直接提醒奶奶本人"}</div></div>
    <span class="pill ${S.flags.dadAway ? "hot" : "ghost"}">${S.flags.dadAway ? "不在" : "在"}</span></div>
  </button>` : ""}
  ${formSwitch()}`;
}

/* ── 家庭待办表：按日子排，像时间表一样。但每条都带着它属于哪一块责任 ──── */
function agendaBlock() {
  const days = agenda(me());
  if (!days.length) return "";
  return `<p class="sec-label">全家的待办表</p>
  <div class="agenda">${days.map((g) => `
    <div class="aday">
      <div class="adate"><b>${esc(g.day)}</b><span>${g.items.length} 件</span></div>
      ${g.items.map((t) => {
        const d = domainOf(t.domainId);
        const mineTask = INVISIBLE.every((f) => t[f] === me());
        const miss = evidenceMissing(t.evidenceIds);
        return `<div class="arow ${t.status === "done" ? "done" : ""} ${miss ? "missing" : ""}">
          <span class="atime">${esc(t.at || "—")}</span>
          <div class="abody">
            <b>${esc(t.title)}</b>
            <span class="ameta">${esc(d ? d.name : "")}
              ${d && d.ownerId ? ` · 由${esc(roleName(d.ownerId))}负责` : ` · <i class="warn">还没人管</i>`}</span>
            ${miss ? `<span class="ameta" style="color:var(--amber)">原始记录已删除，这条要重算</span>` : ""}
            ${mineTask && t.status !== "done" ? `<span class="onlyme">这件事的每一步都只有你在做</span>` : ""}
          </div>
          ${t.status === "done" ? `<span class="pill ok">做完了</span>` : ""}
        </div>`;
      }).join("")}
    </div>`).join("")}</div>`;
}

/* 「这不是我的情况」：措辞只描述看到什么，不提任何身份 */
const formSwitch = () =>
  `<button class="formswitch" ${A("sheet:form")}>这不是我的情况，换一种版式</button>`;

function domainCard(d) {
  const tasks = S.tasks.filter((t) => t.domainId === d.id);
  const inv = {};
  ORDER.forEach((u) => (inv[u] = 0));
  tasks.forEach((t) => INVISIBLE.forEach((f) => { if (t[f] && inv[t[f]] !== undefined) inv[t[f]]++; }));
  const tot = Math.max(1, ORDER.reduce((a, u) => a + inv[u], 0));

  return `<button class="card domain ${d.ownerId ? "" : "ownerless"}" ${A("sheet:domain", `data-id="${d.id}"`)}
    style="width:100%;text-align:left">
    <div class="card-h">
      <div><h3>${esc(d.name)}</h3>
        <div class="owner">${d.ownerId
          ? `<span class="avatar sm ${d.ownerId}">${esc(USERS[d.ownerId].initial)}</span> 由${esc(roleName(d.ownerId))}负责`
          : `<span class="pill hot">还没有人管</span>`}</div></div>
      <span class="pill ghost">${esc(visLabel(d.visibility))}</span>
    </div>
    ${evidenceMissing(d.evidenceIds) ? `<div class="pill pend" style="margin-bottom:8px">原始记录已删除 · 待重算</div>` : ""}
    <div class="next"><em>下一步</em>${esc(d.nextAction)}</div>
    <div class="loadbar">${ORDER.map((u) =>
      `<i class="${u === me() ? "self" : "other"}" style="flex:${inv[u] || 0.001}"></i>`).join("")}</div>
    <div class="loadcap">
      <span>看不见的活儿：${ORDER.filter((u) => inv[u]).map((u) => `${roleName(u)} ${Math.round((inv[u] / tot) * 100)}%`).join(" · ") || "—"}</span>
      <span>${tasks.filter((t) => t.status !== "done").length} 项没做完</span></div>
  </button>`;
}

function handoverInbox(h) {
  const d = domainOf(h.domainId);
  const st = hStatus(h);
  return `<button class="card" ${A("sheet:handover", `data-id="${h.id}"`)} style="width:100%;text-align:left">
    <div class="card-h"><div><h3>${esc(d.name)}</h3>
      <div class="sub">${esc(roleName(h.fromId))}想把这一整块交给你</div></div>
      <span class="pill ${st.cls}">${esc(st.short)}</span></div>
    <div class="next"><em>接手后第一件事</em>${esc(h.packet.nextStep)}</div>
  </button>`;
}

function careCard(r) {
  const ce = S.careEvents.filter((c) => c.careRuleId === r.id).slice(-1)[0];
  const cls = !ce ? "ok" : ce.state === "closed" ? "ok"
    : (ce.state === "ack_timeout" || ce.state.startsWith("escalated") || ce.state === "unresolved") ? "hot" : "pend";
  return `<button class="card" ${A("sheet:caredetail", `data-id="${r.id}"`)} style="width:100%;text-align:left">
    <div class="card-h"><div><h3>${esc(r.title)}</h3>
      <div class="sub">提醒${esc(roleName(r.subjectId))} · ${esc(r.schedule)}</div></div>
      <span class="pill ${cls}">${esc(!ce ? "在跑" : CE_LABEL[ce.state] || ce.state)}</span></div>
    <div class="loadcap"><span>要她回一下 · 超过 ${r.ackTimeoutSec} 秒没回就往下找人</span>
      <span>${r.announceTargets.length ? "客厅也会播报" : "只发手机"}</span></div>
  </button>`;
}

const CE_LABEL = {
  scheduled: "已排定", notified: "已提醒她", acked: "她回应了", ack_timeout: "超时没回应",
  escalated_L1: "已往下找人", escalated_L2: "找到全家", handled: "有人处理了",
  closed: "已闭环", unresolved: "始终没人处理",
};

/* ═══════════════════════════════ 页三：连接中心 ═══════════════════════════════ */
function linkTab() {
  const conn = S.channels.filter((c) => c.connected).length;
  return `
  <div class="linkhead">
    <p class="eyebrow">CONNECTION CENTER</p>
    <h2>让记得在常用聊天工具里工作</h2>
    <p>每个平台各自验身份、各自绑会话。连接之前不会读你的历史聊天。</p>
  </div>
  <div class="linksum">
    <span><i></i>${S.channels.length} 个连接器</span>
    <span>${conn} 个已连</span>
    <span>凭据只进部署密钥管理</span>
  </div>

  ${S.channels.map((c) => `
  <div class="chcard ${c.connected ? "on" : ""}">
    <div class="chhead">
      <span class="chlogo ${c.id}">${esc(c.logo)}</span>
      <div class="cht"><b>${esc(c.name)}</b><span>${esc(c.sub)}</span></div>
      <span class="pill ${c.connected ? "ok" : "pend"}">${esc(c.connected ? "已连接" : c.state)}</span>
    </div>
    <p class="chcopy">${esc(c.copy)}</p>
    <div class="chcaps">
      ${c.caps.map((x) => `<span>${esc(x)}</span>`).join("")}
      ${c.blocked.map((x) => `<span class="no">${esc(x)}</span>`).join("")}
    </div>
    ${c.endpoint ? `<div class="chep"><span>POST</span><code>${esc(c.endpoint.replace("POST ", ""))}</code></div>` : ""}
    <button class="chmore" ${A("chdetail", `data-id="${c.id}"`)}
      aria-expanded="${U().chOpen === c.id}">
      ${U().chOpen === c.id ? "收起" : "看接入边界"} <span>${U().chOpen === c.id ? "↑" : "→"}</span></button>
    ${U().chOpen === c.id ? `<div class="chdetail"><p>${esc(c.detail)}</p></div>` : ""}
    <button class="act ${c.connected ? "ghost" : "pri"}" ${A("chtoggle", `data-id="${c.id}"`)}>
      ${c.connected ? "断开" : c.id === "ch_wx" ? "扫码绑定" : "配置签名接口"}</button>
  </div>`).join("")}

  <div class="routing">
    <div><span>01</span><b>平台验签</b><small>拒绝伪造和重放</small></div>
    <i aria-hidden="true">→</i>
    <div><span>02</span><b>绑定身份</b><small>不靠昵称猜成员</small></div>
    <i aria-hidden="true">→</i>
    <div><span>03</span><b>先出草稿</b><small>有后果的事先确认</small></div>
    <i aria-hidden="true">→</i>
    <div><span>04</span><b>可靠投递</b><small>送到和看到分开算</small></div>
  </div>
  <p class="fixture" style="text-align:left;margin-top:14px">
    这一页只展示已经定好的接入边界。原型里没有配置任何真实平台凭据，
    也没有启动任何消息适配器。</p>`;
}

/* ═══════════════════════════════ 聊天渲染 ═══════════════════════════════ */
function renderChat(cid) {
  const c = convoOf(cid);
  return (S.chats[cid] || []).map((m) => {
    if (m.t === "sep") return `<div class="timesep"><span>${esc(m.text)}</span></div>`;
    if (m.t === "sys") return `<div class="syssep"><span>${esc(m.text)}</span></div>`;
    if (m.vis && !canSee(me(), m.vis, m.from)) return "";

    const mine = m.from === me();
    const isAgent = m.from === "agent";
    const av = isAgent ? `<div class="avatar ai">记</div>`
      : `<div class="avatar ${m.from}">${esc(USERS[m.from] ? USERS[m.from].initial : "?")}</div>`;
    const inner = m.kind === "card" ? renderCard(m) : bubble(m);
    return `<div class="msg ${mine ? "me" : ""}">${av}
      <div class="wrap ${m.kind === "card" ? "wide" : ""}">
        ${c.type !== "agent_dm" && !isAgent && !mine ? `<span class="who">${esc(roleName(m.from))}</span>` : ""}
        ${isAgent && m.layer === "family" && m.kind !== "card" ? `<span class="layertag">家里的事</span>` : ""}
        ${inner}</div></div>`;
  }).join("");
}

function bubble(m) {
  if (m.voice) {
    const bars = [6, 11, 15, 9, 13, 5, 10, 14, 8, 12].map((h) => `<i style="height:${h}px"></i>`).join("");
    return `<div class="bubble"><span class="voice">◉ <span class="wave">${bars}</span> ${m.voice}″</span>
      <div style="font-size:calc(var(--fs) - 3px);opacity:.82;margin-top:7px">${esc(m.text)}</div></div>`;
  }
  return `<div class="bubble">${esc(m.text)}</div>`;
}

/* ═══════════════════════════════ 结构化卡片 ═══════════════════════════════ */
function renderCard(m) {
  switch (m.card) {
    case "consent": {
      const e = evOf(m.evId);
      if (!e) return "";
      if (m.resolved) {
        const lab = { space: "已经告诉家里人了", restricted: `只告诉了${roleName("dad")}`, self: "没有告诉任何人" }[m.resolved];
        return `<div class="cardmsg ${m.resolved === "self" ? "" : "ok"}">
          <div class="ck">${m.resolved === "self" ? "只留在你这里" : "已经记下来了"}</div>
          <h4>${esc(lab)}</h4>
          <p class="cf">${m.resolved === "self"
            ? "这句话没进家庭库，不算进任何统计，家里人看不到。"
            : `记录里写明是你自己同意的。看得到的人：${visLabel(e.visibility)}。`}</p></div>`;
      }
      return `<div class="cardmsg">
        <div class="ck">要问你一下</div>
        <h4>要不要我把这件事告诉家里人？</h4>
        <div class="quote">${esc(e.raw)}</div>
        <p class="cf">你不同意，这句话就只留在你这里。也可以只告诉其中一个人。</p>
        <div class="opts">
          <button class="opt pri" ${A("consent", `data-msg="${m.id}" data-c="space"`)}><span class="ico">✓</span>告诉家里人</button>
          <button class="opt" ${A("consent", `data-msg="${m.id}" data-c="restricted"`)}>
            <span class="ico">◐</span>只告诉建国<small>林秀看不到这条</small></button>
          <button class="opt ghost" ${A("consent", `data-msg="${m.id}" data-c="self"`)}><span class="ico">✕</span>先别说</button>
        </div></div>`;
    }

    case "ruleDraft": {
      const r = ruleOf(m.ruleId);
      const active = r.status === "active";
      return `<div class="cardmsg ${active ? "ok" : "pend"}">
        <div class="ck">${active ? "已经在跑了" : "还没生效，要你点头"}</div>
        <h4>${esc(r.title)}</h4>
        <p class="cf">提醒${esc(roleName(r.subjectId))}　·　${esc(r.schedule)}<br />
        要她回一下。超过 ${r.ackTimeoutSec} 秒没回就往下找人<br />
        顺序：先她自己 → ${r.escalationChain.map((l) => l.to.map(roleName).join("、")).join(" → ")}
        ${r.announceTargets.length ? `<br />同时在${r.announceTargets.map((a) => announcerOf(a).label).join("、")}播报一次` : ""}</p>
        ${r.createdFromEvidenceId ? `<div class="evs">${evBtn(r.createdFromEvidenceId)}</div>` : ""}
        ${active
          ? `<p class="cf" style="margin-top:10px">${esc(roleName(r.confirmedBy))}在 ${esc(r.confirmedAt)} 点头的。
             之后的到点、提醒、等回应、往下找人，全都是程序在做。</p>`
          : `<div class="opts"><button class="opt pri" ${A("confirmrule", `data-id="${r.id}"`)}>
             <span class="ico">✓</span>就按这个来</button></div>`}
      </div>`;
    }

    case "layerInfo":
      return `<div class="cardmsg ok"><div class="ck">家里的事</div>
        <h4>${esc(m.title)}</h4><p class="cf">${esc(m.text)}</p>
        ${m.evIds ? `<div class="evs">${m.evIds.map(evBtn).join("")}</div>` : ""}</div>`;

    case "handover": {
      const h = handoverOf(m.hid);
      if (!h) return "";
      const st = hStatus(h);
      return `<div class="cardmsg ${st.cls === "done" ? "ok" : st.cls === "pend" ? "pend" : ""}">
        <div class="ck">${esc(st.label)}</div>
        <h4>${esc(domainOf(h.domainId).name)}</h4>
        <p class="cf">${esc(roleName(h.fromId))} → ${esc(roleName(h.toId))}　·　交出去的是一整块，不是一次帮忙</p>
        <div class="opts"><button class="opt" ${A("sheet:handover", `data-id="${h.id}"`)}>
          <span class="ico">▤</span>看看这一块都包含什么</button></div></div>`;
    }

    case "careNotify": {
      const ce = ceOf(m.ceid);
      const r = ruleOf(ce.careRuleId);
      const done = ce.state === "acked" || ce.state === "closed";
      return `<div class="cardmsg ${done ? "ok" : "pend"}">
        <div class="ck">${done ? "记下了" : "该吃药了"}</div>
        <h4>${esc(r.title)}</h4>
        <p class="cf">${done ? `${esc(ce.ackedAt)} 你说吃过了` : "饭后吃。吃完点一下就行"}</p>
        ${done ? "" : `<div class="opts">
          <button class="opt pri" ${A("careack", `data-id="${ce.id}"`)}><span class="ico">✓</span>我吃了</button>
          <button class="opt ghost" ${A("caresnooze", `data-id="${ce.id}"`)}><span class="ico">◔</span>等一会儿</button>
        </div>`}</div>`;
    }

    case "escalate": {
      const ce = ceOf(m.ceid);
      const r = ruleOf(ce.careRuleId);
      const closed = ce.state === "closed";
      return `<div class="cardmsg ${closed ? "ok" : ""}">
        <div class="ck">${closed ? "已经闭环" : "她还没回应"}</div>
        <h4>${esc(roleName(r.subjectId))}的「${esc(r.title)}」${closed ? "有人处理了" : "还没有回应"}</h4>
        <p class="cf">${closed ? `${esc(roleName(ce.handledBy))}处理的 · ${esc(ce.closedAt)}`
          : `超过 ${r.ackTimeoutSec} 秒没回。${m.level >= r.escalationChain.length
              ? "这是最后一步了：最好有人去当面看一下。" : "再没人管会继续往下找人。"}`}</p>
        ${chainView(ce, r)}
        ${closed ? "" : `<div class="opts">
          <button class="opt pri" ${A("carehandled", `data-id="${ce.id}"`)}><span class="ico">✓</span>我去看</button>
          <button class="opt" ${A("sheet:caredetail", `data-id="${r.id}"`)}><span class="ico">▤</span>看完整记录</button>
        </div>`}</div>`;
    }

    /* 播报回执：五种状态分开。播了不等于她听见了（PRD 4.11.2） */
    case "announce": {
      const an = S.announcements.find((x) => x.id === m.anid);
      if (!an) return "";
      const s = AN_STATE[an.state];
      return `<div class="cardmsg ${s.cls}">
        <div class="ck">${esc(announcerOf(an.announcerId).label)}播报</div>
        <h4>${esc(s.title)}</h4><p class="cf">${esc(s.desc)}</p>
        <div class="anstates">${Object.keys(AN_STATE).filter((k) => k !== "queued").map((k) =>
          `<span class="${k === an.state ? "on" : ""}">${AN_STATE[k].short}</span>`).join("")}</div>
        <p class="cf" style="margin-top:9px">不管播成什么样，都不算她已经吃了。
        要等她自己回一下，超时该往下找人还是会找。</p></div>`;
    }

    case "report": {
      const r = weeklyReport();
      return `<div class="cardmsg"><div class="ck">本周</div>
        <h4>协调的活儿集中在一个人身上</h4><p class="cf">${esc(r.narrative)}</p>
        <div class="opts"><button class="opt" ${A("sheet:report")}><span class="ico">▦</span>看完整报告</button></div></div>`;
    }
  }
  return "";
}

const AN_STATE = {
  queued: { cls: "", short: "排队中", title: "刚发出去", desc: "已经交给设备，还没有结果。" },
  delivered: { cls: "ok", short: "播完了", title: "确认播完了", desc: "收到了明确的播放完成信号。" },
  accepted_unverified: { cls: "pend", short: "已接受但没看到播放", title: "设备接受了，但没看到它真的播",
    desc: "设备说请求收到了，可是我们没有观察到任何「正在播」的状态。这只能算接受，不能算播出去了。" },
  timed_out: { cls: "", short: "超时", title: "等太久了", desc: "超过等待上限还没结果。这和失败是两件事，分开记。" },
  cancelled: { cls: "", short: "被打断", title: "被打断了", desc: "被更要紧的播报打断，或者被主动停掉了。" },
  failed: { cls: "", short: "失败", title: "没播出去", desc: "明确失败，带错误码。日志里不记播报原文和设备返回内容。" },
};

function evBtn(id) {
  const e = evOf(id);
  if (!e || !canSeeEv(me(), e)) return "";
  return `<button class="ev ${e.deleted ? "gone" : ""}" ${A("sheet:evidence")}>
    ◷ ${esc(roleName(e.speakerId))} ${esc(e.occurredAt)}</button>`;
}

function chainView(ce, r) {
  const seq = [
    { k: "notified", t: `先提醒${roleName(r.subjectId)}自己`, s: "这是这个功能的意义所在" },
    { k: "ack_timeout", t: `等了 ${r.ackTimeoutSec} 秒没回`, s: "到点就判，程序做的" },
    ...r.escalationChain.map((l) => ({
      k: "escalated_L" + l.level, t: `往下找 ${l.to.map(roleName).join("、")}`,
      s: l.level === r.escalationChain.length ? "最后一步：最好有人去当面看" : "",
    })),
    { k: "closed", t: "有人处理 · 记一笔", s: "" },
  ];
  const reached = ce.log.map((x) => x.state);
  return `<div class="chain">${seq.map((s) => {
    const on = reached.includes(s.k) || (s.k === "closed" && ce.state === "closed");
    const warn = on && (s.k === "ack_timeout" || s.k.startsWith("escalated"));
    return `<div class="lnk ${warn ? "warn" : on ? "on" : ""}"><div class="g"><i></i><u></u></div>
      <div class="x"><b>${esc(s.t)}</b>${s.s ? `<small>${esc(s.s)}</small>` : ""}</div></div>`;
  }).join("")}</div>`;
}

/* ═══════════════════════════════ 输入区 ═══════════════════════════════ */
function composer(cid) {
  const u = U();
  return `<div class="composer">
    ${u.listening ? `<div class="voicebar"><span class="wv">${[4, 9, 14, 7, 12, 5, 10].map((h) =>
      `<i style="animation-delay:${h * 22}ms"></i>`).join("")}</span>在听…说完点一下完成
      <button ${A("voicestop")} style="margin-left:auto;font-weight:600">完成</button></div>` : ""}
    ${u.rewrite ? `<div class="rewrite">
      <div class="rk">换个说法 · 只改你还没发出去的这条</div>
      <p>${esc(u.rewrite)}</p>
      <div class="actrow">
        <button class="act pri" ${A("rewriteapply")}>用这句</button>
        <button class="act ghost" ${A("rewritedrop")}>还是发原话</button>
      </div></div>` : ""}
    <div class="cbox">
      <textarea id="ta" rows="1" maxlength="500"
        placeholder="${isTalkOnly() ? "想说什么就说，也可以按住说话" : "跟记得说点什么…"}">${esc(u.draft || "")}</textarea>
      <button class="cbtn" ${A("voice")} aria-label="说话">◉</button>
      <button class="cbtn send" ${A("send", `data-convo="${cid}"`)} aria-label="发送">↑</button>
    </div></div>`;
}

/* ═══════════════════════════════ 抽屉 ═══════════════════════════════ */
function sheet() {
  const s = U().sheet;
  if (!s) return "";
  const v = sheetContent(s);
  if (!v) return "";
  return `<div class="scrim" ${A("closesheet")}></div>
  <div class="sheet" role="dialog" aria-modal="true">
    <div class="grip"></div>
    <div class="sh"><div class="st">${esc(v.title)}${v.sub ? `<small>${esc(v.sub)}</small>` : ""}</div>
      <button class="x" ${A("closesheet")} aria-label="关闭">×</button></div>
    <div class="sb">${v.body}</div></div>`;
}

function sheetContent(s) {
  const [kind, id] = s.split(":");

  if (kind === "form") {
    const cur = familyForm(me());
    const inf = inferForm(me());
    return {
      title: "换一种版式", sub: "选你顺手的那个，随时能再换",
      body: `
      <p style="font-size:13px;color:var(--muted);line-height:1.72;margin-bottom:14px">
        我们看你平时在家里操心哪些事，猜了一种可能顺手的版式。猜错了就在这儿换。</p>
      ${["map", "duty", "talk"].map((f) => `
        <button class="setrow" ${A("setform", `data-f="${f}"`)}>
          <div class="t">${esc(FORM_LABEL[f])}<small>${esc(FORM_DESC[f])}</small></div>
          ${f === cur ? `<span class="pill ok">现在用的</span>` : `<span class="arrow">›</span>`}
        </button>`).join("")}
      <p class="sec-label">我们为什么这样猜</p>
      <div class="narr"><em>依据</em>${esc(inf.basis)}。
        ${inf.cold ? "记录还不够多，所以先给了个中性的。" : "你在这儿换过之后，我们就不再自己改了。"}</div>
      ${S.overrides[me()] ? `<button class="act ghost" ${A("clearform")}>取消我的选择，交给它自己判断</button>` : ""}`,
    };
  }

  if (kind === "report") {
    const r = weeklyReport();
    return {
      title: "本周责任集中度", sub: "由五阶段字段现场统计",
      body: `
      <table class="rtable"><thead><tr><th>这一步是谁在做</th>
        ${ORDER.map((u) => `<th style="text-align:right">${esc(roleName(u))}</th>`).join("")}</tr></thead>
      <tbody>${r.rows.map((row) => `<tr class="${row.invisible ? "inv" : ""}">
        <td>${esc(row.label)}<div class="rbar">${ORDER.map((u) =>
          `<i class="${row.counts[u] ? "" : "z"}" style="width:${(row.counts[u] / r.maxCount) * 52}px"></i>`).join("")}</div></td>
        ${ORDER.map((u) => `<td class="n">${row.counts[u]}</td>`).join("")}</tr>`).join("")}</tbody></table>

      <div class="narr"><em>产品这样说</em>${esc(r.narrative)}</div>
      <p style="font-size:12px;color:var(--muted);line-height:1.72;margin-bottom:14px">
      产品不这样说：「爸爸只做了 10%，他不合格。」没有总分、没有等级、没有排名，也不给任何人标红。</p>

      <p class="sec-label">几个数</p>
      ${ORDER.map((u) => `<div class="metric"><span>${esc(roleName(u))}承担的活儿里，看不见的占</span>
        <b>${r.invisibleShare(u)}%</b></div>`).join("")}
      <div class="metric"><span>最集中在一个人身上的比例</span><b>${r.concentration}%</b></div>
      <div class="metric"><span>还没人管的责任</span><b>${r.ownerless} 块</b></div>
      <div class="metric"><span>只出手做、没担整块的</span>
        <b>${r.execOnly.length ? r.execOnly.map(roleName).join("、") : "—"}</b></div>

      <p class="sec-label">口径</p>
      <p style="font-size:12.5px;color:var(--muted);line-height:1.75">
      「实际执行」是看得见的活儿，其余四步是看不见的。表里每个数字都来自任务上的
      <code style="font-size:11px">discoveredBy / deadlineKeptBy / scheduledBy / executedBy / followedUpBy</code>
      五个字段，不是现场编的。每条都能点开看原话。</p>
      ${r.ownerless ? `<button class="act pri" ${A("propose")} style="margin-top:16px">看看这一块能不能交出去</button>` : ""}`,
    };
  }

  if (kind === "handover") {
    const h = handoverOf(id) || S.handovers.slice(-1)[0];
    if (!h) return null;
    const st = hStatus(h);
    const miss = h.packet.missingInfo.filter((x) => !x.filled);
    return {
      title: "这一整块都包含什么", sub: domainOf(h.domainId).name,
      body: `
      <div class="statusline ${st.cls}">${esc(st.label)}</div>
      <div class="missing">
        <div class="mk">还没弄清的 · ${miss.length} 项</div>
        <ul>${h.packet.missingInfo.map((x) =>
          `<li class="${x.filled ? "filled" : ""}">${esc(x.q)}${x.filled ? ` — <b>${esc(x.a)}</b>` : ""}</li>`).join("")}</ul>
        ${miss.length ? `<p style="font-size:12px;color:var(--accent-ink);margin-top:9px;line-height:1.7">
          还有没弄清的事，这一块就交不过去。不能出现「以为交出去了，其实没人管」。</p>
          ${me() === h.fromId ? `<button class="act danger" ${A("fillinfo", `data-id="${h.id}"`)} style="margin-top:10px">
            把这 ${miss.length} 项补上</button>` : ""}` : ""}
      </div>
      <div class="hfield"><div class="k">这一块管到哪</div><div class="v">${esc(h.packet.scope)}</div></div>
      <div class="hfield"><div class="k">之前发生过什么</div><ul>${h.packet.history.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="hfield"><div class="k">要注意的</div><ul>${h.packet.constraints.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="hfield"><div class="k">要联系谁</div><ul>${h.packet.contacts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="hfield"><div class="k">已经确定的</div><ul>${h.packet.known.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="hfield"><div class="k">接手后第一件事</div><div class="v">${esc(h.packet.nextStep)}</div></div>
      <div class="hfield"><div class="k">每条都能点开看原话</div>
        <div class="evs">${h.packet.evidenceIds.map(evBtn).join("")}</div></div>

      <p class="sec-label">两边都得点头</p>
      <div class="metric"><span>${esc(roleName(h.fromId))}确认交出去</span>
        <b>${h.fromConfirmedAt ? "✓ " + h.fromConfirmedAt : "还没"}</b></div>
      <div class="metric"><span>${esc(roleName(h.toId))}确认接下来</span>
        <b>${h.toConfirmedAt ? "✓ " + h.toConfirmedAt : "还没"}</b></div>
      <p style="font-size:12px;color:var(--muted);line-height:1.72;margin:12px 0">两边缺一个都不算交完。</p>

      ${h.status === "accepted"
        ? `<div class="statusline done">交完了 · 以后这一块的提醒发给${esc(roleName(h.toId))}，${esc(roleName(h.fromId))}不再收到催办</div>`
        : me() === h.fromId && !h.fromConfirmedAt
          ? `<button class="act pri" ${A("hfrom", `data-id="${h.id}"`)}>我确认把这一整块交出去</button>`
          : me() === h.toId && !h.toConfirmedAt
            ? (miss.length
              ? `<button class="act" disabled>还有 ${miss.length} 项没弄清，先接不了</button>`
              : `<div class="actrow"><button class="act pri" ${A("hto", `data-id="${h.id}"`)}>我接下来</button>
                 <button class="act ghost" ${A("hdecline", `data-id="${h.id}"`)}>暂时接不了</button></div>`)
            : `<button class="act" disabled>等对方确认</button>`}`,
    };
  }

  if (kind === "domain") {
    const d = domainOf(id);
    if (!d || !canSeeDomain(me(), d)) return null;
    const tasks = S.tasks.filter((t) => t.domainId === d.id);
    const sigs = S.signals.filter((x) => x.domainId === d.id);
    return {
      title: d.name, sub: SPACE.name,
      body: `
      ${d.ownerId ? `<div class="statusline done">由${esc(roleName(d.ownerId))}负责</div>`
        : `<div class="statusline blocked">这一块现在没有人管</div>`}
      <div class="hfield"><div class="k">下一步</div><div class="v">${esc(d.nextAction)}</div></div>
      <div class="hfield"><div class="k">谁能看到</div><div class="v">${esc(visLabel(d.visibility))}</div></div>

      <p class="sec-label">这些零散的话合起来是同一件事 · ${sigs.length} 条</p>
      ${sigs.map((x) => `<div class="titem"><div class="t">${esc(x.text)}
        <small style="color:var(--muted)">有多确定 ${x.confidence.toFixed(2)}</small>
        <div class="evs">${(x.evidenceIds || []).map(evBtn).join("")}</div></div></div>`).join("")}

      <p class="sec-label">${tasks.length} 件事 · 每一步是谁在做</p>
      ${tasks.map((t) => `<div class="titem ${t.status === "done" ? "done" : ""}">
        <span class="box">✓</span><div class="t">${esc(t.title)}${stageChips(t)}</div>
        ${t.dueAt ? `<span class="due">${esc(t.dueAt)}</span>` : ""}</div>`).join("")}
      <p style="font-size:12px;color:var(--muted);line-height:1.72;margin-top:12px">
        这些是从原话里推出来的草稿，看错了可以在这儿改，改动会留痕。</p>
      ${!d.ownerId ? `<button class="act pri" ${A("propose", `data-domain="${d.id}"`)} style="margin-top:14px">
        提议把这一整块交给一个人</button>` : ""}`,
    };
  }

  if (kind === "caredetail") {
    const r = ruleOf(id);
    if (!r) return null;
    const evs = S.careEvents.filter((c) => c.careRuleId === r.id);
    const ans = S.announcements.filter((a) => a.ruleId === r.id);
    return {
      title: r.title, sub: `提醒${roleName(r.subjectId)} · ${r.schedule}`,
      body: `
      <div class="statusline ${r.status === "active" ? "done" : "pend"}">
        ${r.status === "active" ? `已经在跑 · ${esc(roleName(r.confirmedBy))}在 ${esc(r.confirmedAt)} 点头的`
          : "还没生效 · 没人点头，就不会跑"}</div>
      <div class="hfield"><div class="k">提醒谁</div><div class="v">${esc(roleName(r.subjectId))}</div></div>
      <div class="hfield"><div class="k">什么时候</div><div class="v">${esc(r.schedule)}</div></div>
      <div class="hfield"><div class="k">要她回一下吗</div>
        <div class="v">${r.requireAck ? `要 · 超过 ${r.ackTimeoutSec} 秒没回就往下找人` : "不用"}</div></div>
      <div class="hfield"><div class="k">往下找人的顺序</div>
        <div class="v">先${esc(roleName(r.subjectId))}自己 → ${r.escalationChain.map((l) =>
          l.to.map(roleName).join("、")).join(" → ")}</div></div>
      <div class="hfield"><div class="k">同时在哪儿播报</div>
        <div class="v">${r.announceTargets.length
          ? r.announceTargets.map((a) => `${announcerOf(a).label}（${announcerOf(a).quietHours} 不播）`).join("、")
          : "不播报，只发手机"}</div></div>
      <div class="hfield"><div class="k">这条是哪句话来的</div><div class="evs">${evBtn(r.createdFromEvidenceId)}</div></div>

      <div class="narr"><em>这一段没有 AI</em>到点、发提醒、等回应、判超时、往下找谁、记闭环，全都是写死的程序。
        AI 只做了一件事：把「奶奶血压药一天两次，饭后吃」变成上面这张表，而且必须有人点头才生效。</div>

      ${ans.length ? `<p class="sec-label">播报回执 · ${ans.length} 次</p>
        ${ans.map((a) => `<div class="evrow">
          <div class="eh"><span>${esc(announcerOf(a.announcerId).label)} · ${esc(a.startedAt)}</span>
            <span class="pill ${AN_STATE[a.state].cls || "ghost"}">${esc(AN_STATE[a.state].short)}</span></div>
          <div class="raw">${esc(AN_STATE[a.state].desc)}</div>
          <div class="ef"><span>用固定模板，不是现编的话 · 长度 ${a.renderedLen} 字</span></div></div>`).join("")}
        <p style="font-size:12px;color:var(--accent-ink);line-height:1.72;margin:8px 0 4px">
        播报成功也不算她已经吃了。等回应和超时往下找人完全不看播报结果。</p>` : ""}

      <p class="sec-label">每次提醒都留痕 · ${evs.length} 次</p>
      ${evs.length ? evs.map((ce) => `<div class="evrow">
        <div class="eh"><span>${esc(ce.slot)}</span>
          <span class="pill ${ce.state === "closed" ? "ok" : ce.state === "unresolved" ? "hot" : "pend"}">
            ${esc(CE_LABEL[ce.state] || ce.state)}</span></div>
        <div class="raw" style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px;line-height:1.9">
          ${ce.log.map((l) => `${esc(l.at)}　${esc(CE_LABEL[l.state] || l.state)}　${esc(l.note)}`).join("<br />")}</div>
        </div>`).join("") : `<p style="font-size:12.5px;color:var(--muted)">还没有。演示脚本会跑一次完整的。</p>`}
      ${r.status === "active" ? `<button class="act" ${A("carefire", `data-id="${r.id}"`)} style="margin-top:14px">
        现在手动提醒一次</button>` : ""}`,
    };
  }

  if (kind === "evidence") {
    const mine = S.evidence.filter((e) => canSeeEv(me(), e));
    const hidden = S.evidence.length - mine.length;
    return {
      title: "看我的原话", sub: "原始对话留在这台手机上",
      body: `
      <div class="narr"><em>分三层存</em>
        原始对话留在你手机里，只有你能看全文；家里共享的只是结论加一个指针；
        发给大模型的是脱敏后最短的一小段，真名换成称谓。</div>
      ${hidden ? `<div class="statusline pend">有 ${hidden} 条不在你能看的范围里 · 说话的人限定了谁能看</div>` : ""}
      <div class="metric"><span>本周随口聊聊</span><b>${S.stats.generalTurns} 轮</b></div>
      <div class="metric"><span>其中记进家里的</span><b>${mine.filter((e) => !e.deleted).length} 条</b></div>
      <p style="font-size:12px;color:var(--muted);line-height:1.72;margin:10px 0 4px">
        绝大多数对话只是当普通助手用，不进家里的记录。</p>

      <p class="sec-label">记下来的原话</p>
      ${mine.map((e) => {
        const used = S.signals.filter((x) => (x.evidenceIds || []).includes(e.id));
        return `<div class="evrow ${e.deleted ? "deleted" : ""}">
          <div class="eh"><span>${esc(roleName(e.speakerId))} · ${esc(e.occurredAt)}</span>
            <span class="pill ghost">${esc(visLabel(e.visibility))}</span></div>
          <div class="raw">${esc(e.raw)}</div>
          <div class="ef"><span>支撑 ${used.length} 条结论</span>
            ${e.deleted ? `<span style="margin-left:auto;color:var(--amber)">已删除 · 相关结论要重算</span>`
              : `<button ${A("delev", `data-id="${e.id}"`)}>删掉这条</button>`}</div></div>`;
      }).join("")}

      <p class="sec-label">听着但没当事儿的</p>
      ${S.signals.filter((x) => x.status === "observing").map((x) => `
        <div class="titem"><div class="t">${esc(x.text)}
          <small style="color:var(--muted)">有多确定 ${x.confidence.toFixed(2)} · ${esc(x.why || "")}</small>
          <div class="evs">${(x.evidenceIds || []).map(evBtn).join("")}</div></div></div>`).join("")}
      <p style="font-size:12px;color:var(--muted);line-height:1.72;margin-top:10px">
        这些话我们听着了，但看起来只是聊天，没当成要办的事，也没提醒过你。</p>`,
    };
  }

  if (kind === "settings") {
    const on = S.flags.familyLayer[me()];
    const u = USERS[me()];
    const talk = isTalkOnly();
    return {
      title: talk ? "设置" : "我的", sub: talk ? "只有三项" : `${u.name} · 家里的${u.familyRole}`,
      body: `
      ${talk ? "" : `
        <div class="metric"><span>我在家里是</span><b>${esc(u.familyRole)}</b></div>
        <div class="metric"><span>我最近的状态</span><b>${esc(u.capacityState)}</b></div>
        ${S.joined[me()] ? `<div class="metric"><span>什么时候进这个家的</span><b>${esc(u.consentAt)}</b></div>` : ""}
        <p style="font-size:12px;color:var(--muted);line-height:1.72;margin:10px 0 4px">
          你最近忙不忙会算进来。公平不是一人一半。</p>`}

      <p class="sec-label">${talk ? "" : "我的记录"}</p>
      <button class="setrow" ${A("togglelayer")}>
        <div class="t">帮我记着家里的事<small>${on
          ? "开着：聊天里像是家里要办的事，我会先问你要不要告诉家里人"
          : "关了：照样能聊天，但不再往家里的记录里加东西"}</small></div>
        <i class="sw ${on ? "on" : ""}" aria-hidden="true"></i></button>
      <button class="setrow" ${A("sheet:evidence")}>
        <div class="t">看我的原话<small>每条结论都能点开看来源，也能单条删掉</small></div>
        <span class="arrow">›</span></button>
      ${talk ? `
      <button class="setrow" ${A("bigfont")}>
        <div class="t">字再大一点<small>现在是 ${document.body.classList.contains("bigfont") ? "25" : "21"} 号</small></div>
        <i class="sw ${document.body.classList.contains("bigfont") ? "on" : ""}" aria-hidden="true"></i></button>`
      : `${S.joined[me()] ? `<button class="setrow" ${A("sheet:form")}>
        <div class="t">换一种版式<small>${esc(FORM_DESC[familyForm(me())])}</small></div>
        <span class="arrow">›</span></button>` : ""}
      <button class="setrow" ${A("export")}>
        <div class="t">把我的东西导出来<small>原话、结论、操作记录</small></div>
        <span class="arrow">›</span></button>
      ${S.joined[me()] ? `<p class="sec-label">不可恢复</p>
      <button class="setrow" ${A("sheet:delspace")}
        style="border-color:rgba(201,77,61,.3);background:var(--accent-soft)">
        <div class="t" style="color:var(--accent-ink)">退出并解散${esc(SPACE.name)}
          <small style="color:var(--accent-ink)">删掉之后找不回来 · 要再确认一次</small></div>
        <span class="arrow" style="color:var(--accent-ink)">›</span></button>` : ""}`}
      <p style="font-size:12px;color:var(--muted);line-height:1.78;margin-top:16px">
        这不是医疗设备。它不看病、不替代急救，也不会告诉你药该吃多少。</p>`,
    };
  }

  if (kind === "delspace") {
    return {
      title: `解散${SPACE.name}`, sub: "删掉之后找不回来",
      body: `
      <div class="statusline blocked">会删掉 ${S.evidence.length} 条原话、${S.domains.length} 块责任、
        ${S.tasks.length} 件事，还有全部操作记录。</div>
      <p style="font-size:13.5px;line-height:1.78;color:var(--muted);margin-bottom:16px">
        交接记录平时删不掉，只能归档。但解散整个家会把归档一起清掉 —— 这是唯一的例外，也是你的权利。</p>
      <div class="actrow">
        <button class="act ghost" ${A("closesheet")}>算了</button>
        <button class="act danger" ${A("delspace2")}>我确定要解散</button></div>`,
    };
  }
  return null;
}

function stageChips(t) {
  return `<div class="stages">${STAGES.map(([f, l]) => {
    const v = t[f];
    return `<span class="stg ${!v ? "" : v === me() ? "self" : "other"}">${l}·${v ? esc(roleName(v)) : "—"}</span>`;
  }).join("")}</div>`;
}

/* ═══════════════════════════════ 交接 ═══════════════════════════════ */
function hStatus(h) {
  if (h.status === "accepted") return { cls: "done", label: "交完了", short: "交完了" };
  if (h.status === "declined") return { cls: "blocked", label: "对方暂时接不了", short: "没接" };
  const miss = h.packet.missingInfo.filter((x) => !x.filled).length;
  if (miss > 0) return { cls: "blocked", label: `交不过去 · 还有 ${miss} 项没弄清`, short: `差 ${miss} 项` };
  if (!h.fromConfirmedAt) return { cls: "blocked", label: "交不过去 · 等交出去的人确认", short: "等对方" };
  if (!h.toConfirmedAt) return { cls: "pend", label: "等接手的人确认", short: "等你确认" };
  return { cls: "done", label: "交完了", short: "交完了" };
}
function refreshHandover(h) {
  if (h.status === "declined") return;
  const miss = h.packet.missingInfo.filter((x) => !x.filled).length;
  h.status = miss > 0 ? "pending_info" : (!h.fromConfirmedAt || !h.toConfirmedAt) ? "pending_ack" : "accepted";
}

let hSeq = 0;
function proposeHandover(domainId) {
  const d = domainOf(domainId) || S.domains.find((x) => !x.ownerId);
  if (!d || S.handovers.some((h) => h.domainId === d.id && h.status !== "declined")) return null;
  const r = weeklyReport();
  const to = ORDER.filter((u) => u !== r.topId).sort((a, b) => r.invisibleBy[a] - r.invisibleBy[b])[0];

  const packet = d.id === "d_health" ? {
    scope: "奶奶近期的健康照护：盯着症状、安排复查、当天陪诊、报告归档，还有两周后的复诊。不含每天的吃药提醒 —— 那条你已经在管了。",
    history: ["7/15 骨科门诊，医生说一个月后复查", "8/12 奶奶说腿疼加重，下楼吃力", "上次是林秀陪着去的，报告带回来了但不确定放哪了"],
    constraints: ["只去市三院，别的医院她不去", "不爱空着肚子出门，尽量约下午", "林秀最近在加班期，这一点会算进建议里"],
    contacts: ["市三院骨科门诊台 · 挂号要提前 3 天", "社区医院 王医生 · 能开转诊单"],
    known: ["复查挂骨科", "8/29 之前要去", "两周后还得再去一次"],
    missingInfo: [
      { q: "上次的检查报告在哪？接手之前得先找到", filled: false, a: null },
      { q: "复查要不要空腹？不确认就定不了上下午", filled: false, a: null },
    ],
    nextStep: "打市三院骨科门诊台，问清要不要空腹，然后约 8/29 前的下午号",
    evidenceIds: ["e1", "e2", "e3", "e4", "e8"],
  } : {
    scope: d.name + "：从发现、记住时间、做安排到跟进结果，整块都归接手的人。",
    history: ["还没有记录"], constraints: ["接手前先确认时间安排得开"], contacts: ["还没有"],
    known: [d.nextAction], missingInfo: [{ q: "接手的人要先确认时间安排得开", filled: false, a: null }],
    nextStep: d.nextAction, evidenceIds: d.evidenceIds.slice(),
  };

  const h = { id: "h" + ++hSeq, domainId: d.id, fromId: r.topId, toId: to,
    status: "pending_info", fromConfirmedAt: null, toConfirmedAt: null, packet };
  S.handovers.push(h);
  audit(h.fromId, "handover.proposed", "Handover", h.id, null, { toId: to });
  [h.fromId, h.toId].forEach((u) => pushMsg(dmOf(u).id, { from: "agent", kind: "card", card: "handover", hid: h.id }));
  return h;
}
function fillInfo(hid) {
  const h = handoverOf(hid);
  if (!h) return;
  const answers = ["在客厅电视柜第二个抽屉，牛皮纸袋里", "不用空腹，可以约下午"];
  h.packet.missingInfo.forEach((x, i) => { if (!x.filled) { x.filled = true; x.a = answers[i] || "已确认"; } });
  audit(h.fromId, "handover.info_filled", "Handover", h.id, null, { missing: 0 });
  refreshHandover(h);
}
function acceptHandover(h) {
  const d = domainOf(h.domainId);
  const before = d.ownerId;
  d.ownerId = h.toId;
  h.status = "accepted";
  audit(h.toId, "handover.accepted", "Handover", h.id, { ownerId: before }, { ownerId: d.ownerId });
  pushMsg(dmOf(h.toId).id, { t: "sys", text: `「${d.name}」的提醒从现在起发给你。第一件事：${h.packet.nextStep}` });
  pushMsg(dmOf(h.fromId).id, { t: "sys", text: `「${d.name}」已经交给${roleName(h.toId)}了。这一块的提醒不再发给你，首页上对应条目已经没了。` });
  pushMsg("family", { from: "agent", kind: "card", card: "handover", hid: h.id });
  S.flags.handoverDone = true;
  S.ui[h.fromId].toast = "交完了。你那边「只有你在记得」少了几条。";
}

/* ═══════════════════════════════ 播报（假适配器）═══════════════════════════════ */
let anSeq = 0;
function announce(rule, ce) {
  rule.announceTargets.forEach((aid) => {
    const an = announcerOf(aid);
    if (!an || !an.enabled) return;
    const text = `${roleName(rule.subjectId)}，${rule.title}时间到了，饭后吃`;
    const rec = { id: "an" + ++anSeq, ruleId: rule.id, ceId: ce.id, announcerId: aid,
      template: "care_reminder", renderedLen: text.length, state: "queued", startedAt: nowStamp(), settledAt: null };
    S.announcements.push(rec);
    audit("system", "announce.queued", "Announcement", rec.id, null, { announcerId: aid });
    /* 刻意落在 accepted_unverified：设备说收到 ≠ 喇叭响过 */
    timers.push(setTimeout(() => {
      rec.state = "accepted_unverified";
      rec.settledAt = nowStamp();
      audit("system", "announce.settled", "Announcement", rec.id, null, { state: rec.state });
      pushMsg(dmOf(rule.primaryCaregiverId).id, { from: "agent", kind: "card", card: "announce", anid: rec.id });
      render();
    }, 1500));
  });
}

/* ═══════════════════════════════ 看护状态机（无 LLM）═══════════════════════════════ */
let ceSeq = 0;
const careLog = (ce, state, note) => { ce.state = state; ce.log.push({ at: nowStamp(), state, note }); };

function careStart(ruleId, slot) {
  const r = ruleOf(ruleId);
  if (!r || r.status !== "active") return null;
  const ce = { id: "ce" + ++ceSeq, careRuleId: ruleId, slot: slot || r.schedule, state: "scheduled",
    notifiedAt: null, ackedAt: null, escalationLevel: 0, escalatedTo: [], handledBy: null, closedAt: null, log: [] };
  careLog(ce, "scheduled", "到点了，程序建的");
  S.careEvents.push(ce);
  /* 先提醒她本人，而不是先找看护人 —— 这是这个功能的意义 */
  careLog(ce, "notified", `提醒${roleName(r.subjectId)}自己`);
  ce.notifiedAt = nowStamp();
  pushMsg(dmOf(r.subjectId).id, { from: "agent", kind: "card", card: "careNotify", ceid: ce.id });
  audit("system", "care.notified", "CareEvent", ce.id, null, { state: "notified" });
  announce(r, ce);
  if (S.flags.dadAway) {
    pushMsg(dmOf(r.primaryCaregiverId).id, { t: "sys", text: `你说了这段时间有事。提醒已经直接发给${roleName(r.subjectId)}，${roleName("mom")}先顶着。` });
    pushMsg(dmOf("mom").id, { t: "sys", text: `建国这段时间有事，先你顶着。奶奶的「${r.title}」提醒已经直接发给她了。` });
  }
  timers.push(setTimeout(() => careTimeout(ce.id), S.ackTimeoutMs));
  render();
  return ce;
}
function careTimeout(ceid) {
  const ce = ceOf(ceid);
  if (!ce || ce.state !== "notified") return;
  const r = ruleOf(ce.careRuleId);
  careLog(ce, "ack_timeout", `等了 ${r.ackTimeoutSec} 秒没回（到点就判，程序做的）`);
  audit("system", "care.ack_timeout", "CareEvent", ce.id, null, { state: "ack_timeout" });
  render();
  timers.push(setTimeout(() => careEscalate(ceid, 1), 1100));
}
function careEscalate(ceid, level) {
  const ce = ceOf(ceid);
  if (!ce || ce.state === "closed" || ce.state === "acked") return;
  const r = ruleOf(ce.careRuleId);
  const link = r.escalationChain.find((l) => l.level === level);
  if (!link) {
    careLog(ce, "unresolved", "该找的人都找过了还是没人管 · 留着不消失");
    audit("system", "care.unresolved", "CareEvent", ce.id, null, { state: "unresolved" });
    return render();
  }
  careLog(ce, "escalated_L" + level, `找了 ${link.to.map(roleName).join("、")}`);
  ce.escalationLevel = level;
  ce.escalatedTo = link.to.slice();
  audit("system", "care.escalated", "CareEvent", ce.id, { level: level - 1 }, { level });
  link.to.forEach((u) => pushMsg(dmOf(u).id, { from: "agent", kind: "card", card: "escalate", ceid: ce.id, level }));
  pushMsg("family", { from: "agent", kind: "card", card: "escalate", ceid: ce.id, level });
  render();
  if (level < r.escalationChain.length) timers.push(setTimeout(() => careEscalate(ceid, level + 1), 2400));
}
function careAck(ceid, by) {
  const ce = ceOf(ceid);
  if (!ce || ce.state === "closed") return;
  const r = ruleOf(ce.careRuleId);
  ce.ackedAt = nowStamp();
  careLog(ce, "acked", `${roleName(by)}回应了`);
  careLog(ce, "closed", "记一笔，这次结束");
  ce.closedAt = nowStamp();
  ce.handledBy = by;
  audit(by, "care.closed", "CareEvent", ce.id, null, { state: "closed" });
  ce.escalatedTo.forEach((u) => pushMsg(dmOf(u).id, { t: "sys", text: `${roleName(r.subjectId)}已经回应「${r.title}」，这次结束了。` }));
}

/* ═══════════════════════════════ 见证（原型用启发式）═══════════════════════════════ */
const FAMILY_HINTS = /复查|复诊|体检|医院|挂号|看病|吃药|血压|药|疼|摔|发烧|接孩子|开学|家长会|缴费|水电|燃气|保险|疫苗|退休|社保|收拾|换季|搬|修/;
const ACCUSE_HINTS = /你从来|你根本|你就是|你怎么总是|你又|你能不能|一点都不|从来不管|都是我/;
function generalReply(text) {
  if (/天气/.test(text)) return "今天 26 度，多云，风不大。傍晚可能有阵雨，出门带把伞。";
  if (/改|润色|简洁|写/.test(text)) return "给你改短了一版，动词提前、结论在前。要再压一点吗？";
  if (/做什么菜|吃什么|菜谱/.test(text)) return "有番茄和鸡蛋的话，番茄炒蛋最快。想清淡点就冬瓜排骨汤。";
  if (/翻译/.test(text)) return "行，把要翻的发我，中英日韩都可以。";
  if (/[?？吗]/.test(text)) return "我大概明白你想问什么。说得再具体点，我能答得更准。";
  return "记下了。还有别的要我帮忙的吗？";
}

let evSeq = 20, sigSeq = 20;
function send(cid) {
  const u = U();
  const text = (u.draft || "").trim();
  if (!text || !cid) return;
  pushMsg(cid, { from: me(), kind: "text", text });
  u.draft = ""; u.rewrite = null;
  if (convoOf(cid).type !== "agent_dm") return render();   /* 群里 Agent 不主动介入 */

  /* 没进家 → 家庭层不存在，永远只是普通助手 */
  const hit = S.joined[me()] && S.flags.familyLayer[me()] && FAMILY_HINTS.test(text);
  if (!hit) {
    S.stats.generalTurns++;
    setTimeout(() => { pushMsg(cid, { from: "agent", kind: "text", layer: "general", text: generalReply(text) }); render(); }, 340);
    return render();
  }
  const e = { id: "e" + ++evSeq, speakerId: me(), sourceType: "agent_dm",
    occurredAt: "今天 " + nowStamp().slice(0, 5), raw: text, visibility: "self", deleted: false };
  S.evidence.push(e);
  audit(me(), "evidence.created", "Evidence", e.id, null, { visibility: "self" });
  setTimeout(() => { pushMsg(cid, { from: "agent", kind: "card", card: "consent", evId: e.id }); render(); }, 400);
  render();
}

function resolveConsent(msgId, choice) {
  let msg = null;
  Object.keys(S.chats).forEach((k) => S.chats[k].forEach((m) => { if (m.id === msgId) msg = m; }));
  if (!msg || msg.resolved) return;
  const e = evOf(msg.evId);
  const speaker = e.speakerId;

  if (choice === "self") {
    msg.resolved = "self"; e.visibility = "self";
    audit(speaker, "consent.declined", "Evidence", e.id, null, { visibility: "self" });
    S.ui[speaker].toast = "好，这句话只留在你这儿。";
    return;
  }
  e.visibility = choice === "restricted" ? ["dad", speaker] : "care_related";
  const d = domainOf("d_health");
  S.signals.push({ id: "s" + ++sigSeq, text: "腿疼加重了", domainId: d.id,
    confidence: 0.89, status: "confirmed", evidenceIds: [e.id] });
  d.evidenceIds.push(e.id);
  d.nextAction = "症状有加重，复查别再往后拖：约市三院骨科下午号，确认要不要空腹";
  msg.resolved = choice;
  audit(speaker, "consent.granted", "Evidence", e.id, { visibility: "self" }, { visibility: e.visibility });

  (choice === "restricted" ? ["dad"] : ORDER.filter((u) => u !== speaker)).forEach((u) =>
    pushMsg(dmOf(u).id, { from: "agent", kind: "card", card: "layerInfo",
      title: `${roleName(speaker)}的腿疼有加重`,
      text: `这条是${roleName(speaker)}自己同意告诉${choice === "restricted" ? "你" : "家里人"}的。已经归到「${d.name}」，没有新建待办 —— 它改的是这一块的下一步。`,
      evIds: [e.id], vis: choice === "restricted" ? ["dad", speaker] : "care_related" }));
  S.ui[speaker].toast = choice === "restricted" ? "只告诉建国了，林秀看不到这条。" : "已经告诉家里人了。";
}

/* ═══════════════════════════════ 动作分发 ═══════════════════════════════ */
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id, u = U();

  if (act === "tab") { u.tab = el.dataset.tab; if (el.dataset.tab !== "chat") u.convo = null; return render(); }
  if (act === "openconvo") { u.convo = el.dataset.convo; u.unreadChat = 0; return render(); }
  if (act === "backconvo") { u.convo = null; return render(); }
  if (act === "closesheet") { u.sheet = null; return render(); }
  if (act.startsWith("sheet:")) { u.sheet = act.slice(6) + (id ? ":" + id : ""); return render(); }

  /* 密钥门 */
  if (act === "keysubmit") {
    if (u.keyInput.trim().toUpperCase() !== DEMO_KEY) { u.keyErr = true; return render(); }
    u.keyErr = false; u.keyInput = "";
    S.joined[me()] = true;
    audit(me(), "member.joined", "Member", me(), null, { familyRole: USERS[me()].familyRole });
    u.toast = `进来了。家里人叫你${USERS[me()].familyRole}。`;
    return render();
  }

  /* 版式：本人覆盖优先于推断 */
  if (act === "setform") {
    S.overrides[me()] = el.dataset.f;
    u.sheet = null; u.convo = null;
    audit(me(), "form.override", "Member", me(), null, { form: el.dataset.f });
    u.toast = "换好了。以后不会自己变回去。";
    return render();
  }
  if (act === "clearform") { delete S.overrides[me()]; u.sheet = null; return render(); }

  /* 连接中心 */
  if (act === "chdetail") { u.chOpen = u.chOpen === id ? null : id; return render(); }
  if (act === "chtoggle") {
    const c = channelOf(id);
    c.connected = !c.connected;
    audit(me(), c.connected ? "channel.connected" : "channel.disconnected", "Channel", c.id, null, null);
    u.toast = c.connected
      ? (id === "ch_wx" ? "已绑定。只接已配对的私聊，不含微信群，也不读历史聊天。" : "签名接口已配置。返回 202 只代表事件收下了，不代表送到人。")
      : "已断开。绑定关系已撤销。";
    return render();
  }

  /* 同意门与规则 */
  if (act === "consent") { resolveConsent(el.dataset.msg, el.dataset.c); return render(); }
  if (act === "confirmrule") {
    const r = ruleOf(id);
    r.status = "active"; r.confirmedBy = me(); r.confirmedAt = nowStamp();
    audit(me(), "carerule.activated", "CareRule", r.id, { status: "draft" }, { status: "active" });
    u.toast = "好了。之后到点、提醒、等回应、往下找人都是程序在做。";
    return render();
  }

  /* 交接 */
  if (act === "propose") {
    const h = proposeHandover(el.dataset.domain);
    if (h) { u.sheet = "handover:" + h.id; u.toast = "这一块整理好了，但还有没弄清的事 —— 交不过去。"; }
    else u.toast = "这一块已经在交接流程里了。";
    return render();
  }
  if (act === "fillinfo") { fillInfo(id); u.toast = "两项都补上了。现在等两边确认。"; return render(); }
  if (act === "hfrom") {
    const h = handoverOf(id); h.fromConfirmedAt = nowStamp();
    audit(me(), "handover.from_confirmed", "Handover", h.id, null, null);
    refreshHandover(h);
    if (h.status === "accepted") acceptHandover(h);
    return render();
  }
  if (act === "hto") {
    const h = handoverOf(id); h.toConfirmedAt = nowStamp();
    audit(me(), "handover.to_confirmed", "Handover", h.id, null, null);
    refreshHandover(h);
    if (h.status === "accepted") acceptHandover(h);
    u.sheet = null;
    return render();
  }
  if (act === "hdecline") {
    const h = handoverOf(id); h.status = "declined";
    audit(me(), "handover.declined", "Handover", h.id, null, null);
    u.sheet = null;
    S.ui[h.fromId].toast = "他暂时没接。这一块还是没人管，不会不了了之。";
    return render();
  }

  /* 看护 */
  if (act === "careack") { careAck(id, me()); u.toast = "记下了，我告诉他们你吃过了。"; return render(); }
  if (act === "caresnooze") { u.toast = "好，过一会儿我再问你一次。"; return render(); }
  if (act === "carehandled") { careAck(id, me()); u.toast = "这次结束了，记了一笔。"; return render(); }
  if (act === "carefire") { careStart(id, "手动触发"); return; }
  if (act === "dadaway") {
    S.flags.dadAway = !S.flags.dadAway;
    audit(me(), S.flags.dadAway ? "care.away" : "care.back", "Member", me(), null, null);
    if (S.flags.dadAway) {
      pushMsg(dmOf("mom").id, { t: "sys", text: "建国说这段时间有事。你先顶着，Agent 会直接提醒奶奶。" });
      u.toast = "交出去了。奶奶会被直接提醒，林秀顶着。";
    } else u.toast = "好，还是你管。";
    return render();
  }

  /* 隐私 */
  if (act === "delev") {
    const e = evOf(id);
    e.deleted = true;
    audit(me(), "evidence.deleted", "Evidence", e.id, { deleted: false }, { deleted: true });
    S.signals.forEach((s) => {
      if ((s.evidenceIds || []).includes(e.id) && evidenceMissing(s.evidenceIds)) {
        s.status = "evidence_missing";
        audit("system", "signal.invalidated", "Signal", s.id, null, { status: "evidence_missing" });
      }
    });
    u.toast = "删了。引用它的结论已经标成要重算。";
    return render();
  }
  if (act === "togglelayer") {
    S.flags.familyLayer[me()] = !S.flags.familyLayer[me()];
    audit(me(), "flag.family_layer", "Member", me(), null, { on: S.flags.familyLayer[me()] });
    u.toast = S.flags.familyLayer[me()] ? "开了。" : "关了。还能照常聊天，但不再往家里的记录里加东西。";
    return render();
  }
  if (act === "export") { u.toast = `导出了：${S.evidence.length} 条原话、${S.audit.length} 条操作记录。`; return render(); }
  if (act === "bigfont") { document.body.classList.toggle("bigfont"); syncSwitches(); return render(); }
  if (act === "delspace2") {
    S.joined[me()] = false;
    u.sheet = null; u.tab = "home";
    audit(me(), "space.left", "Space", SPACE.id, null, null);
    u.toast = "已经退出了。要再进来得重新拿密钥。";
    return render();
  }

  /* 输入 */
  if (act === "send") { send(el.dataset.convo); return render(); }
  if (act === "voice") {
    u.listening = true; render();
    timers.push(setTimeout(() => {
      u.listening = false;
      if (me() === "grandma") u.draft = "腿又疼了，这两天上楼得扶着扶手";
      render();
    }, 1700));
    return;
  }
  if (act === "voicestop") { u.listening = false; return render(); }
  if (act === "rewriteapply") { u.draft = u.rewrite; u.rewrite = null; return render(); }
  if (act === "rewritedrop") { u.rewrite = null; return render(); }
});

document.addEventListener("input", (ev) => {
  const ta = ev.target, u = U();
  if (ta.id === "keyin") {
    u.keyInput = ta.value; u.keyErr = false;
    const c = ta.selectionStart; render();
    const b = document.getElementById("keyin");
    if (b) { b.focus(); b.setSelectionRange(c, c); }
    return;
  }
  if (ta.id !== "ta") return;
  u.draft = ta.value;
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 92) + "px";
  if (!isTalkOnly() && ACCUSE_HINTS.test(ta.value) && !u.rewrite) {
    u.rewrite = "妈下周三要复查，我这周排不开。你能不能接下这次的挂号和陪诊？";
    const c = ta.selectionStart; render();
    const b = document.getElementById("ta");
    if (b) { b.focus(); b.setSelectionRange(c, c); }
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.target.id !== "ta") return;
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    send(U().convo || dmOf(me()).id);
    render();
  }
});

/* ═══════════════════════════════ 演示脚本 ═══════════════════════════════ */
const as = (who) => { S.actor = who; };
const STEPS = [
  { t: "刚打开，它就是个普通助手",
    d: "改周报、想晚饭吃什么。这些都不进任何家庭记录 —— 它现在就是个豆包。左边可以切换演示谁。",
    run() { as("mom"); S.ui.mom.tab = "chat"; S.ui.mom.convo = "dm_mom"; } },

  { t: "点「家里」，要先有密钥",
    d: "加入一个家只有这条路：家里人私下给你密钥。我们不搜手机号，也不读通讯录。",
    run() { as("mom"); S.ui.mom.tab = "home"; S.ui.mom.convo = null; S.ui.mom.keyInput = ""; } },

  { t: "输入密钥，进家",
    d: "进来之后才多出家里那一层：全家的待办表、谁在负责哪一块、以及这周只有你在记得的事。",
    run() {
      as("mom");
      S.ui.mom.keyInput = DEMO_KEY;
      S.joined.mom = true;
      audit("mom", "member.joined", "Member", "mom", null, { familyRole: "妈妈" });
      S.ui.mom.tab = "home";
      S.flags.remBefore = onlyIRemember("mom").length;
    } },

  { t: "对话页现在能切到家庭群了",
    d: "同一个入口，多了一个家庭群。Agent 也会在群里发提醒和报告，但不评价任何人。",
    run() { as("mom"); S.ui.mom.tab = "chat"; S.ui.mom.convo = "family"; } },

  { t: "奶奶在自己手机上说了一句",
    d: "切到奶奶。注意不是偷偷记下来的 —— 它先问她同不同意。三个选项都试试，「先别说」是真的不入库。",
    run() {
      as("grandma");
      S.ui.grandma.tab = "chat"; S.ui.grandma.convo = "dm_gma";
      const e = { id: "e" + ++evSeq, speakerId: "grandma", sourceType: "agent_dm",
        occurredAt: "今天 " + nowStamp().slice(0, 5), raw: "腿又疼了，这两天上楼得扶着扶手",
        visibility: "self", deleted: false };
      S.evidence.push(e);
      pushMsg("dm_gma", { from: "grandma", kind: "text", voice: 6, text: e.raw });
      audit("grandma", "evidence.created", "Evidence", e.id, null, { visibility: "self" });
      timers.push(setTimeout(() => { pushMsg("dm_gma", { from: "agent", kind: "card", card: "consent", evId: e.id }); render(); }, 520));
    } },

  { t: "本周责任集中度",
    d: "切回妈妈。念中性叙述那句。表里每个数字都是从五阶段字段现场算的，可以当场追问任意一格。",
    run() { autoConsent(); as("mom"); S.ui.mom.tab = "home"; S.ui.mom.convo = null; S.ui.mom.sheet = "report"; } },

  { t: "提议整块交给爸爸 · 但交不过去",
    d: "这一秒千万别跳。缺「报告在哪」和「要不要空腹」两项，所有权就不转移。责任不能不了了之。",
    run() { as("mom"); const h = proposeHandover("d_health"); S.ui.mom.sheet = h ? "handover:" + h.id : null; } },

  { t: "补上信息，两边确认",
    d: "补齐之后切到爸爸，让他确认接下来。两边缺一个都不算交完。",
    run() {
      const h = S.handovers.slice(-1)[0];
      if (h) { fillInfo(h.id); if (!h.fromConfirmedAt) h.fromConfirmedAt = nowStamp(); refreshHandover(h); }
      as("dad"); S.ui.dad.tab = "home"; S.ui.dad.convo = null;
      S.ui.dad.sheet = h ? "handover:" + h.id : null;
    } },

  { t: "吃药场景 · 这一段没有一行 AI",
    d: "爸爸临时有事 → 直接提醒奶奶本人 + 客厅播报 → 超时没回 → 往下找人 → 闭环。注意播报回执：设备说收到了，但没看到它真的播，所以只算「已接受」，超时该找人还是找。",
    run() {
      const h = S.handovers.slice(-1)[0];
      if (h && !h.toConfirmedAt) { h.toConfirmedAt = nowStamp(); refreshHandover(h); if (h.status === "accepted") acceptHandover(h); }
      as("dad"); S.ui.dad.sheet = null; S.ui.dad.tab = "chat"; S.ui.dad.convo = "dm_dad";
      S.flags.dadAway = true;
      careStart("cr1", "今天 20:00");
    } },

  { t: "连接中心",
    d: "让记得在常用聊天工具里工作。V1 只做两个：个人微信私聊，和第三方机器人的签名接口。个人微信那张卡上明写「不含微信群」——不能含糊。",
    run() { as("mom"); S.ui.mom.tab = "link"; S.ui.mom.convo = null; S.ui.mom.sheet = null; S.ui.mom.chOpen = "ch_wx"; } },

  { t: "回到家里那一页",
    d: "「只有你在记得」从 7 件变成 2 件。不是删掉了，是有人接手了。顺手点一下「这不是我的情况」，说明这个版式是猜的，猜错了一下就能换。",
    run() { as("mom"); S.ui.mom.tab = "home"; S.ui.mom.sheet = null; S.ui.mom.chOpen = null; } },
];

function autoConsent() {
  Object.keys(S.chats).forEach((k) =>
    S.chats[k].forEach((m) => { if (m.card === "consent" && !m.resolved) resolveConsent(m.id, "space"); }));
}

/* ═══════════════════════════════ 渲染 ═══════════════════════════════ */
let toastTimer = null;
function render() {
  const el = document.getElementById("scr");
  el.innerHTML = screen();
  el.classList.toggle("senior", isTalkOnly());
  renderRail();

  const b = document.getElementById("body");
  if (b && b.classList.contains("chat")) b.scrollTop = b.scrollHeight;
  const ta = document.getElementById("ta");
  if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 92) + "px"; }
  if (U().toast) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { U().toast = null; render(); }, 4400);
  }
  fitPhone();
}

function renderRail() {
  const r = weeklyReport();
  const rem = onlyIRemember(me());

  document.getElementById("actorpick").innerHTML = ORDER.map((u) => `
    <button class="actorbtn ${u === S.actor ? "on" : ""}" data-actor="${u}">
      <span class="avatar sm ${u}">${esc(USERS[u].initial)}</span>
      <b>${esc(USERS[u].familyRole)}</b><small>${esc(USERS[u].name)}</small>
      ${S.joined[u] ? "" : `<i class="nojoin">没进家</i>`}
    </button>`).join("");

  document.getElementById("plabel").innerHTML =
    `<b>${esc(USERS[me()].name)} · 家里的${esc(USERS[me()].familyRole)}</b>
     <div class="cap">${S.joined[me()]
       ? esc(FORM_DESC[familyForm(me())])
       : "还没进家，现在只是个普通助手"}</div>`;

  document.getElementById("steps").innerHTML = STEPS.map((s, i) => `
    <button class="step ${i === S.step ? "cur" : i < S.step ? "done" : ""}" data-step="${i}">
      <span class="n">${i + 1}</span><span class="tx">${esc(s.t)}</span></button>`).join("");

  const cur = STEPS[Math.min(S.step, STEPS.length - 1)];
  document.getElementById("stage-title").textContent = cur.t;
  document.getElementById("stage-desc").textContent = cur.d;

  document.getElementById("metrics").innerHTML = `
    <div class="kv"><span>${esc(USERS[me()].familyRole)}进家了吗</span><b>${S.joined[me()] ? "进了" : "还没"}</b></div>
    <div class="kv"><span>只有妈妈在记得</span><b class="${onlyIRemember("mom").length > 2 ? "hot" : ""}">${onlyIRemember("mom").length} 件</b></div>
    <div class="kv"><span>看不见的活儿集中度</span><b class="${r.concentration >= 80 ? "hot" : ""}">${r.concentration}%</b></div>
    <div class="kv"><span>还没人管的责任</span><b class="${r.ownerless ? "hot" : ""}">${r.ownerless} 块</b></div>
    <div class="kv"><span>只出手做没担整块</span><b>${r.execOnly.length ? r.execOnly.map(roleName).join("、") : "—"}</b></div>
    <div class="kv"><span>随口聊 / 记进家里</span><b>${S.stats.generalTurns} / ${S.evidence.filter((e) => !e.deleted).length}</b></div>
    <div class="kv"><span>播报回执</span><b>${S.announcements.length ? esc(AN_STATE[S.announcements.slice(-1)[0].state].short) : "—"}</b></div>
    <div class="kv"><span>已连接的连接器</span><b>${S.channels.filter((c) => c.connected).length} / ${S.channels.length}</b></div>`;

  document.getElementById("audit").innerHTML = S.audit.length
    ? S.audit.slice(0, 40).map((a) => `<div>${esc(a.at)} <i>${esc(a.actorId)}</i> ${esc(a.action)}</div>`).join("")
    : `<div style="opacity:.6">还没有操作</div>`;

  const btn = document.getElementById("btn-next");
  btn.disabled = S.step >= STEPS.length;
  btn.textContent = S.step >= STEPS.length ? "走完了" : `下一步 → ${S.step + 1}/${STEPS.length}`;
}

function fitPhone() {
  const box = document.getElementById("phones");
  if (!box) return;
  const avail = Math.min(box.clientWidth - 20, 460);
  const availH = window.innerHeight - 210;
  box.style.setProperty("--s", Math.max(0.6, Math.min(1, Math.min(avail / 390, availH / 844))).toFixed(3));
}
window.addEventListener("resize", fitPhone);

function syncSwitches() {
  document.querySelector("#sw-speed .sw").classList.toggle("on", S.ackTimeoutMs <= 12000);
  document.querySelector("#sw-bigfont .sw").classList.toggle("on", document.body.classList.contains("bigfont"));
}

/* 引导 */
document.getElementById("actorpick").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-actor]");
  if (b) { S.actor = b.dataset.actor; render(); }
});
document.getElementById("btn-next").addEventListener("click", () => {
  if (S.step >= STEPS.length) return;
  STEPS[S.step].run(); S.step++; render();
});
document.getElementById("btn-reset").addEventListener("click", () => { seed(); render(); syncSwitches(); });
document.getElementById("steps").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-step]");
  if (!b) return;
  const target = +b.dataset.step;
  seed();
  for (let i = 0; i <= target && i < STEPS.length; i++) { STEPS[i].run(); S.step = i + 1; }
  render();
});
document.getElementById("sw-speed").addEventListener("click", () => {
  S.ackTimeoutMs = S.ackTimeoutMs <= 12000 ? 60000 : 12000;
  syncSwitches();
});
document.getElementById("sw-bigfont").addEventListener("click", () => {
  document.body.classList.toggle("bigfont"); syncSwitches(); render();
});

seed();
render();
syncSwitches();
