"use strict";
/* ═══════════════════════════════════════════════════════════════════════════
   《都记得》· 数据模型
   四条硬性约定：
     1. Task 的五个阶段字段是一等字段，报告由它们现场统计，视图层不推导、不写死。
     2. 通用对话默认不进家庭库。要进，必须本人过一次同意门。
     3. visibility 真实生效 —— 「只告诉某人」会让别人真的看不到。
     4. 责任身份不存单值：推断 + 本人覆盖（覆盖优先）。它只决定本人首页形态，
        绝不上界面。界面上唯一的身份词是家庭称谓。
   ═══════════════════════════════════════════════════════════════════════════ */

/* 一个用户只属于一个家。空间概念在界面上不出现。 */
const SPACE = { id: "home", name: "林家", createdBy: "mom" };

const USERS = {
  mom: { id: "mom", name: "林秀", familyRole: "妈妈", initial: "秀", capacityState: "加班期", consentAt: "2026-08-19" },
  dad: { id: "dad", name: "陈建国", familyRole: "爸爸", initial: "建", capacityState: "正常", consentAt: "2026-08-19" },
  grandma: { id: "grandma", name: "周素兰", familyRole: "奶奶", initial: "兰", capacityState: "正常", consentAt: "2026-08-20" },
};
const ORDER = ["mom", "dad", "grandma"];
const uname = (id) => (USERS[id] ? USERS[id].name : id);
/* 界面上称呼一个人：用家庭称谓 */
const roleName = (id) => (USERS[id] ? USERS[id].familyRole : id);

/* 家庭密钥。生产环境只存带盐哈希，这里是公开演示码 */
const DEMO_KEY = "DEMO-HOME";

const STAGES = [
  ["discoveredBy", "发现问题"],
  ["deadlineKeptBy", "记住截止时间"],
  ["scheduledBy", "制定安排"],
  ["executedBy", "实际执行"],
  ["followedUpBy", "跟进结果"],
];
const INVISIBLE = ["discoveredBy", "deadlineKeptBy", "scheduledBy", "followedUpBy"];

const VIS_LABEL = { space: "全家可见", care_related: "仅照护相关成员可见", self: "仅本人可见 · 没进家庭库" };
const visLabel = (v) => (Array.isArray(v) ? `仅 ${v.map(roleName).join("、")} 可见` : VIS_LABEL[v] || v);

let S = null;
let timers = [];

/* ═══════════════════════════════════════════════════════════════════════════
   Fixture
   ═══════════════════════════════════════════════════════════════════════════ */
function seed() {
  timers.forEach(clearTimeout);
  timers = [];

  S = {
    /* 会话：一个 1:1（通用 Agent）+ 一个家庭群 */
    convos: [
      { id: "dm_mom", type: "agent_dm", members: ["mom"] },
      { id: "dm_dad", type: "agent_dm", members: ["dad"] },
      { id: "dm_gma", type: "agent_dm", members: ["grandma"] },
      { id: "family", type: "family_group", members: ["mom", "dad", "grandma"] },
    ],

    /* ── L0 原始记录 ─────────────────────────────────────────────────────── */
    evidence: [
      { id: "e1", speakerId: "grandma", sourceType: "agent_dm", occurredAt: "08-12 09:20",
        raw: "腿这两天又疼了，下楼有点吃力", visibility: "care_related", deleted: false },
      { id: "e2", speakerId: "mom", sourceType: "agent_dm", occurredAt: "07-15 16:04",
        raw: "医生说一个月以后复查，挂骨科", visibility: "space", deleted: false },
      { id: "e3", speakerId: "mom", sourceType: "family_group", occurredAt: "08-13 21:11",
        raw: "要先挂哪个科？上次的报告放哪了", visibility: "space", deleted: false },
      { id: "e4", speakerId: "grandma", sourceType: "agent_dm", occurredAt: "07-20 10:02",
        raw: "我不爱空着肚子出门，下午的号好", visibility: "care_related", deleted: false },
      { id: "e5", speakerId: "mom", sourceType: "screenshot", occurredAt: "08-15 08:40",
        raw: "[学校通知截图] 新生体检表请于 8 月 28 日前交回", visibility: "space", deleted: false },
      { id: "e6", speakerId: "dad", sourceType: "agent_dm", occurredAt: "08-20 19:30",
        raw: "奶奶血压药一天两次，饭后吃，别忘了", visibility: "care_related", deleted: false },
      { id: "e7", speakerId: "mom", sourceType: "agent_dm", occurredAt: "08-21 22:15",
        raw: "换季的衣服还没收，柜子塞不下了", visibility: "space", deleted: false },
      { id: "e8", speakerId: "grandma", sourceType: "agent_dm", occurredAt: "07-15 17:00",
        raw: "市三院我熟，别的医院我不去", visibility: "care_related", deleted: false },
      /* 两条干扰句：只是讨论，见证不该建任务 */
      { id: "e9", speakerId: "dad", sourceType: "family_group", occurredAt: "08-22 12:30",
        raw: "明年是不是该考虑换个大点的房子", visibility: "space", deleted: false },
      { id: "e10", speakerId: "mom", sourceType: "family_group", occurredAt: "08-23 20:05",
        raw: "听说隔壁老王家孩子去学游泳了", visibility: "space", deleted: false },
    ],

    signals: [
      { id: "s1", text: "奶奶腿疼加重", domainId: "d_health", confidence: 0.91, status: "confirmed", evidenceIds: ["e1"] },
      { id: "s2", text: "骨科复查一个月到期", domainId: "d_health", confidence: 0.88, status: "confirmed", evidenceIds: ["e2"] },
      { id: "s3", text: "挂号科室未确定", domainId: "d_health", confidence: 0.74, status: "confirmed", evidenceIds: ["e3"] },
      { id: "s4", text: "检查报告位置未知", domainId: "d_health", confidence: 0.71, status: "confirmed", evidenceIds: ["e3"] },
      { id: "s5", text: "就诊偏好：下午号、只去市三院", domainId: "d_health", confidence: 0.83, status: "confirmed", evidenceIds: ["e4", "e8"] },
      { id: "s6", text: "体检表 8/28 截止", domainId: "d_school", confidence: 0.95, status: "confirmed", evidenceIds: ["e5"] },
      { id: "s7", text: "血压药每日两次", domainId: "d_health", confidence: 0.93, status: "confirmed", evidenceIds: ["e6"] },
      { id: "s8", text: "换季衣物待收纳", domainId: "d_home", confidence: 0.79, status: "confirmed", evidenceIds: ["e7"] },
      /* 低置信度 → 只入待观察池，不打扰、不建任务 */
      { id: "s9", text: "换房", domainId: null, confidence: 0.21, status: "observing",
        why: "只是讨论：没说时间、没人答应、也没有下一步", evidenceIds: ["e9"] },
      { id: "s10", text: "邻居家孩子学游泳", domainId: null, confidence: 0.14, status: "observing",
        why: "别人家的事，跟这个家没有要办的事", evidenceIds: ["e10"] },
    ],

    domains: [
      { id: "d_health", name: "奶奶的近期健康照护", ownerId: null, status: "active", visibility: "care_related",
        nextAction: "约市三院骨科下午号，确认是否需要空腹", evidenceIds: ["e1", "e2", "e3", "e4", "e8"] },
      { id: "d_school", name: "孩子的开学准备", ownerId: "mom", status: "active", visibility: "space",
        nextAction: "8/28 前交回新生体检表", evidenceIds: ["e5"] },
      { id: "d_home", name: "家里的日常补给与收纳", ownerId: "mom", status: "active", visibility: "space",
        nextAction: "暂无待办 · 上一件已经由爸爸做完了", evidenceIds: ["e7"] },
    ],

    /* ── Task 五阶段归属：一等字段。dayKey 用于待办表按天排 ─────────────── */
    tasks: [
      { id: "t1", domainId: "d_health", title: "挂市三院骨科复查号", dueAt: "08-29", at: "上午", status: "open", inWeek: true,
        discoveredBy: "mom", deadlineKeptBy: "mom", scheduledBy: "mom", executedBy: "mom", followedUpBy: "mom", evidenceIds: ["e2", "e3"] },
      { id: "t2", domainId: "d_health", title: "确认复查是否需要空腹", dueAt: null, at: null, status: "open", inWeek: false,
        discoveredBy: "mom", deadlineKeptBy: "mom", scheduledBy: "mom", executedBy: null, followedUpBy: "mom", evidenceIds: ["e4"] },
      { id: "t3", domainId: "d_health", title: "找出上次的检查报告", dueAt: null, at: null, status: "open", inWeek: false,
        discoveredBy: "mom", deadlineKeptBy: "mom", scheduledBy: "mom", executedBy: null, followedUpBy: "mom", evidenceIds: ["e3"] },
      { id: "t4", domainId: "d_health", title: "陪诊当天到场", dueAt: "08-29", at: "14:30", status: "open", inWeek: false,
        discoveredBy: "mom", deadlineKeptBy: "mom", scheduledBy: "mom", executedBy: null, followedUpBy: "mom", evidenceIds: ["e2"] },
      { id: "t5", domainId: "d_health", title: "两周后复诊预约", dueAt: "09-12", at: null, status: "open", inWeek: false,
        discoveredBy: "mom", deadlineKeptBy: "mom", scheduledBy: "mom", executedBy: null, followedUpBy: "mom", evidenceIds: ["e2"] },
      { id: "t6", domainId: "d_school", title: "交回新生体检表", dueAt: "08-28", at: "放学前", status: "open", inWeek: true,
        discoveredBy: "mom", deadlineKeptBy: "mom", scheduledBy: "mom", executedBy: "mom", followedUpBy: "mom", evidenceIds: ["e5"] },
      { id: "t7", domainId: "d_school", title: "买齐校服与文具", dueAt: "08-31", at: null, status: "open", inWeek: false,
        discoveredBy: "mom", deadlineKeptBy: "mom", scheduledBy: "mom", executedBy: null, followedUpBy: "mom", evidenceIds: ["e5"] },
      /* 爸爸做了，但发现/记时间/安排/跟进还是妈妈 → 「只出手做没担整块」能真的算出他 */
      { id: "t8", domainId: "d_home", title: "收换季衣物", dueAt: "08-25", at: null, status: "done", inWeek: true,
        discoveredBy: "mom", deadlineKeptBy: "mom", scheduledBy: "mom", executedBy: "dad", followedUpBy: "mom", evidenceIds: ["e7"] },
    ],

    handovers: [],

    careRules: [
      { id: "cr1", subjectId: "grandma", title: "血压药", schedule: "每天 08:00 / 20:00",
        requireAck: true, ackTimeoutSec: 60,
        escalationChain: [{ level: 1, to: ["dad"] }, { level: 2, to: ["mom", "dad"] }],
        primaryCaregiverId: "dad", createdFromEvidenceId: "e6",
        announceTargets: ["an_living"],
        confirmedBy: "dad", confirmedAt: "08-20 19:34", status: "active" },
      { id: "cr2", subjectId: "grandma", title: "每周量一次血压并记录", schedule: "每周日 09:00",
        requireAck: true, ackTimeoutSec: 60,
        escalationChain: [{ level: 1, to: ["dad"] }],
        primaryCaregiverId: "dad", createdFromEvidenceId: "e6",
        announceTargets: [],
        confirmedBy: null, confirmedAt: null, status: "draft" },
    ],
    careEvents: [],

    /* 播报设备：地址来自部署配置，不接受外部输入。夜间默认不播 */
    announcers: [
      { id: "an_living", label: "客厅", kind: "robot", enabled: true, quietHours: "22:00–07:00" },
    ],
    announcements: [],

    /* ── 连接中心。V1 只做两个：个人微信 + 第三方机器人 ─────────────────── */
    channels: [
      { id: "ch_wx", name: "个人微信", sub: "腾讯 ClawBot 私聊", logo: "Claw", state: "待扫码绑定",
        copy: "通过腾讯的微信插件绑定，只接已经配对的私聊。",
        caps: ["扫码授权", "私聊双向"], blocked: ["不含微信群"],
        detail: "二维码和登录状态只留在插件里，产品这边只存一个不透明的引用。扫码只证明你能登录这个微信号，不代表你是这个家的成员 —— 还得走一次配对。不读历史聊天。",
        connected: false },
      { id: "ch_bot", name: "第三方机器人", sub: "签名 HTTPS 接口", logo: "API", state: "契约已定义",
        copy: "别的机器人把消息标准化后送进来；回复由可靠队列推回去。",
        caps: ["HMAC-SHA256", "5 分钟防重放", "同一事件只算一次"], blocked: [],
        detail: "签名绑定时间戳、随机串、请求方法、路径和请求体哈希。返回 202 只代表事件已经收下并落盘，不代表已经送到人。送达、已读、真的做了，是三件不同的事。",
        endpoint: "POST /gateway/v1/installations/{id}/events",
        connected: false },
    ],

    chats: {},
    audit: [],

    /* 当前在演示哪个角色 */
    actor: "mom",

    /* 每个人是否已经用密钥进过家。没进家就只有通用助手 */
    joined: { mom: false, dad: true, grandma: true },

    ui: {
      mom: { tab: "chat", convo: "dm_mom", sheet: null, toast: null, draft: "", rewrite: null, listening: false, keyInput: "", keyErr: false },
      dad: { tab: "chat", convo: "dm_dad", sheet: null, toast: null, draft: "", rewrite: null, listening: false, keyInput: "", keyErr: false },
      grandma: { tab: "chat", convo: "dm_gma", sheet: null, toast: null, draft: "", rewrite: null, listening: false, keyInput: "", keyErr: false },
    },

    /* 本人对首页形态的覆盖。覆盖优先于推断 */
    overrides: {},

    flags: { familyLayer: { mom: true, dad: true, grandma: true }, dadAway: false, handoverDone: false, remBefore: 0 },
    stats: { generalTurns: 32 },
    step: 0,
    ackTimeoutMs: 12000,
    ackTimeoutRealSec: 60,
  };

  seedChats();
}

/* ═══════════════════════════════════════════════════════════════════════════
   会话内容
   刻意混入通用对话：这是「通用 Agent 之上的家庭 Agent」，
   绝大多数轮次只是普通助手，不产出记录、不进家庭库。
   ═══════════════════════════════════════════════════════════════════════════ */
function seedChats() {
  S.convos.forEach((c) => (S.chats[c.id] = []));

  S.chats.family = [
    { id: "m1", t: "sep", text: "8 月 25 日 周一" },
    { id: "m2", from: "mom", kind: "text", text: "今晚我加班，饭在锅里，你俩先吃" },
    { id: "m3", from: "dad", kind: "text", text: "行，我把碗洗了" },
    { id: "m4", from: "mom", kind: "text", text: "奶奶那个复查你有空顺便看一下吧" },
    { id: "m5", from: "dad", kind: "text", text: "好，你安排好告诉我时间" },
  ];

  /* 奶奶侧：能随口说话本身就有价值，这是她愿意用的唯一理由 */
  S.chats.dm_gma = [
    { id: "g1", t: "sep", text: "今天 上午 8:06" },
    { id: "g2", from: "agent", kind: "text", layer: "general", text: "奶奶早上好。今天外面 26 度，有点风，出门带件薄外套。" },
    { id: "g3", from: "grandma", kind: "text", text: "昨天那个越剧叫什么名字来着" },
    { id: "g4", from: "agent", kind: "text", layer: "general", text: "您昨天听的是《红楼梦》里的「天上掉下个林妹妹」。要我再放一遍吗？" },
    { id: "g5", from: "grandma", kind: "text", text: "不用了，我就是想起个名字" },
  ];

  /* 妈妈侧：先是个普通助手。她还没进家，所以这里没有任何家庭层的东西 */
  S.chats.dm_mom = [
    { id: "mm1", t: "sep", text: "今天 上午 7:50" },
    { id: "mm2", from: "mom", kind: "text", text: "帮我把这段周报改简洁点：本周我主要推进了三季度的渠道复盘，目前已经完成了数据口径的对齐工作……" },
    { id: "mm3", from: "agent", kind: "text", layer: "general", text: "改成这样：「本周完成三季度渠道复盘的数据口径对齐，下周进入归因分析。」\n少了 28 个字，动词提前，结论在前。" },
    { id: "mm4", from: "mom", kind: "text", text: "晚饭做个什么快的" },
    { id: "mm5", from: "agent", kind: "text", layer: "general", text: "有番茄和鸡蛋的话，番茄炒蛋最快。想清淡点就冬瓜排骨汤。" },
  ];

  S.chats.dm_dad = [
    { id: "dd1", t: "sep", text: "8 月 20 日 晚上 7:30" },
    { id: "dd2", from: "dad", kind: "text", text: "奶奶血压药一天两次，饭后吃，别忘了" },
    { id: "dd3", from: "agent", kind: "card", card: "ruleDraft", ruleId: "cr1" },
  ];
}

/* ═══════════════════════════════════════════════════════════════════════════
   派生计算 —— 所有数字都由数据算出，没有一个写死
   ═══════════════════════════════════════════════════════════════════════════ */
const convoOf = (id) => S.convos.find((c) => c.id === id);
const domainOf = (id) => S.domains.find((d) => d.id === id);
const evOf = (id) => S.evidence.find((e) => e.id === id);
const ruleOf = (id) => S.careRules.find((r) => r.id === id);
const ceOf = (id) => S.careEvents.find((c) => c.id === id);
const handoverOf = (id) => S.handovers.find((h) => h.id === id);
const announcerOf = (id) => S.announcers.find((a) => a.id === id);
const channelOf = (id) => S.channels.find((c) => c.id === id);
const dmOf = (userId) => S.convos.find((c) => c.type === "agent_dm" && c.members.includes(userId));

const liveEv = (ids) => (ids || []).filter((i) => { const e = evOf(i); return e && !e.deleted; });
const evidenceMissing = (ids) => (ids || []).length > 0 && liveEv(ids).length === 0;

/* 照护相关成员：用于 care_related 判定 */
function careRelated() {
  const s = new Set();
  S.careRules.forEach((r) => {
    s.add(r.subjectId); s.add(r.primaryCaregiverId);
    r.escalationChain.forEach((l) => l.to.forEach((u) => s.add(u)));
  });
  return s;
}
function canSee(userId, visibility, speakerId) {
  if (Array.isArray(visibility)) return visibility.includes(userId) || userId === speakerId;
  if (visibility === "space") return true;
  if (visibility === "care_related") return careRelated().has(userId);
  if (visibility === "self") return userId === speakerId;
  return false;
}
const canSeeEv = (userId, e) => canSee(userId, e.visibility, e.speakerId);
const canSeeDomain = (userId, d) => canSee(userId, d.visibility, null);

const domainsOwnedBy = (userId) => S.domains.filter((d) => d.ownerId === userId);

/* 「这周，有哪些事一直只有你在记得？」
   独自承担全部四项看不见的活儿，且这一块没有别人接手。 */
function onlyIRemember(userId) {
  return S.tasks.filter((t) => {
    if (t.status === "done") return false;
    const d = domainOf(t.domainId);
    if (d && d.ownerId && d.ownerId !== userId) return false;
    return INVISIBLE.every((f) => t[f] === userId);
  });
}

/* 待办表：按日期排（timetable 式），每条仍然带着它属于哪一块责任 */
function agenda(userId) {
  const visible = S.tasks.filter((t) => {
    const d = domainOf(t.domainId);
    return d && canSeeDomain(userId, d);
  });
  const byDay = {};
  visible.forEach((t) => {
    const k = t.dueAt || "没定日子";
    (byDay[k] = byDay[k] || []).push(t);
  });
  return Object.keys(byDay)
    .sort((a, b) => (a === "没定日子" ? 1 : b === "没定日子" ? -1 : a.localeCompare(b)))
    .map((k) => ({ day: k, items: byDay[k] }));
}

/* ── 本周责任集中度：完全由五阶段字段统计 ───────────────────────────────── */
function weeklyReport() {
  const week = S.tasks.filter((t) => t.inWeek);

  const rows = STAGES.map(([field, label]) => {
    const counts = {};
    ORDER.forEach((u) => (counts[u] = 0));
    week.forEach((t) => { if (t[field] && counts[t[field]] !== undefined) counts[t[field]]++; });
    return { field, label, counts, invisible: INVISIBLE.includes(field) };
  });

  const invisibleBy = {}, allBy = {};
  ORDER.forEach((u) => { invisibleBy[u] = 0; allBy[u] = 0; });
  week.forEach((t) => STAGES.forEach(([f]) => {
    if (!t[f] || allBy[t[f]] === undefined) return;
    allBy[t[f]]++;
    if (INVISIBLE.includes(f)) invisibleBy[t[f]]++;
  }));

  const totalInvisible = ORDER.reduce((a, u) => a + invisibleBy[u], 0);
  const topId = ORDER.slice().sort((a, b) => invisibleBy[b] - invisibleBy[a])[0];
  const ownerless = S.domains.filter((d) => !d.ownerId).length;
  const execOnly = ORDER.filter((u) => allBy[u] > 0 && invisibleBy[u] === 0 && domainsOwnedBy(u).length === 0);
  const maxCount = Math.max(1, ...rows.flatMap((r) => ORDER.map((u) => r.counts[u])));

  return {
    rows, maxCount, invisibleBy, allBy, topId, ownerless, execOnly, totalInvisible,
    invisibleShare: (u) => (allBy[u] ? Math.round((invisibleBy[u] / allBy[u]) * 100) : 0),
    concentration: totalInvisible ? Math.round((invisibleBy[topId] / totalInvisible) * 100) : 0,
    /* 中性叙述：只陈述分布，不归因、不打分 */
    narrative: "本周家庭协调工作集中在一位成员身上。虽然执行任务有所分担，"
      + "但发现、安排与跟进仍未形成完整责任所有权。",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   家庭页形态：从行为推断，本人可覆盖（PRD 4.1.5）
   只决定这个人自己看到哪种版式，绝不上界面、绝不给别人看。
   ═══════════════════════════════════════════════════════════════════════════ */
function inferForm(userId) {
  const r = weeklyReport();
  if (r.totalInvisible < 3) return { form: "duty", basis: "记录还不够多，先给个中性的", cold: true };

  const cared = S.careRules.some((c) => c.subjectId === userId && c.status === "active");
  if (cared && r.allBy[userId] === 0) {
    return { form: "talk", basis: "有人在替他记着事，他自己没有承担任何一步", cold: false };
  }
  if (r.topId === userId && r.invisibleBy[userId] > 0 && r.concentration >= 50) {
    return {
      form: "map",
      basis: `发现、记时间、安排、跟进里有 ${r.invisibleBy[userId]} 项在他身上，占全家看不见的活儿的 ${r.concentration}%`,
      cold: false,
    };
  }
  return {
    form: "duty",
    basis: r.allBy[userId] ? `参与了 ${r.allBy[userId]} 项，其中看不见的活儿 ${r.invisibleBy[userId]} 项` : "本周没有承担记录",
    cold: false,
  };
}
const familyForm = (userId) => S.overrides[userId] || inferForm(userId).form;

/* ── 审计 ─────────────────────────────────────────────────────────────────── */
let auditSeq = 0;
function audit(actorId, action, targetType, targetId, before, after) {
  S.audit.unshift({ id: "a" + ++auditSeq, actorId, action, targetType, targetId, before, after, at: nowStamp() });
}
function nowStamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let msgSeq = 0;
function pushMsg(convoId, msg) {
  if (!S.chats[convoId]) return null;
  const m = Object.assign({ id: "x" + ++msgSeq }, msg);
  S.chats[convoId].push(m);
  return m;
}
