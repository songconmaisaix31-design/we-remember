const form = document.querySelector("#composer-form");
const input = document.querySelector("#agent-input");
const feed = document.querySelector("#conversation-feed");
const timeline = document.querySelector("#timeline");
const eventCount = document.querySelector("#event-count");
const receiptCard = document.querySelector("#receipt-card");
const receiptCopy = document.querySelector("#receipt-copy");
const toast = document.querySelector("#toast");
const voiceState = document.querySelector("#voice-state");
const voiceStateLabel = document.querySelector("#voice-state-label");
const dictateButton = document.querySelector("#dictate-button");
const voiceMessageButton = document.querySelector("#voice-message-button");
const stopVoiceButton = document.querySelector("#stop-voice");
const integrationsDialog = document.querySelector("#integrations-dialog");
const appShell = document.querySelector(".app-shell");
const scheduleDayFilter = document.querySelector("#schedule-day-filter");
const scheduleEventList = document.querySelector("#schedule-event-list");
const peopleMemberList = document.querySelector("#people-member-list");
const notificationReceiptList = document.querySelector("#notification-receipt-list");
const scheduleTotalCount = document.querySelector("#schedule-total-count");
const scheduleTodayCount = document.querySelector("#schedule-today-count");
const scheduleNotificationCount = document.querySelector("#schedule-notification-count");
const receiptTotalCount = document.querySelector("#receipt-total-count");
const responsibilityDemo = document.querySelector("#responsibility-demo");
const responsibilityRole = document.querySelector("#responsibility-role");
const responsibilityOwner = document.querySelector("#responsibility-owner");
const responsibilityHandoverStatus = document.querySelector("#responsibility-handover-status");
const responsibilityTodoOwner = document.querySelector("#responsibility-todo-owner");
const responsibilityReminderOwner = document.querySelector("#responsibility-reminder-owner");
const responsibilityNotice = document.querySelector("#responsibility-notice");
const profileAvatar = document.querySelector("#profile-avatar");
const spaceAvatar = document.querySelector("#space-avatar");
const profileName = document.querySelector("#profile-name");
let activeView = "agent";
let selectedMember = "all";

const responsibilityRoles = Object.freeze({
  mother: { label: "妈妈", avatar: "assets/family-work/mother/work.svg" },
  father: { label: "爸爸", avatar: "assets/family-work/father/family.svg" },
  grandmother: { label: "奶奶", avatar: "assets/family-work/grandmother/family.svg" },
});
const responsibilityStatusLabels = Object.freeze({
  accepted: "已接受",
  declined: "已拒绝",
  draft: "草稿",
  pending_ack: "等待爸爸确认",
  pending_info: "等待补充信息",
});
const defaultResponsibilityText = "奶奶复诊的安排一直由我负责，我有点撑不住了，想请爸爸完整接手";
const responsibilityState = {
  action: "reset",
  data: null,
  text: defaultResponsibilityText,
};

const members = Object.freeze([
  { name: "我", role: "self", avatar: "assets/family-work/mother/work.svg", availability: "在线", route: "应用内演示", configured: true },
  { name: "妈妈", role: "mother", avatar: "assets/family-work/mother/family.svg", availability: "可联系", route: "个人微信 ClawBot", configured: false },
  { name: "爸爸", role: "father", avatar: "assets/family-work/father/family.svg", availability: "可联系", route: "飞书演示", configured: true },
  { name: "女儿", role: "daughter", avatar: "assets/family-work/daughter/family.svg", availability: "离线", route: "应用内演示", configured: true },
  { name: "儿子", role: "son", avatar: "assets/family-work/son/family.svg", availability: "离线", route: "未配置", configured: false },
  { name: "奶奶", role: "grandmother", avatar: "assets/family-work/grandmother/family.svg", availability: "可联系", route: "未配置", configured: false },
]);

const events = [
  { id: "fixture-checkup", dayKey: "today", dayLabel: "今天 · 周六", time: "09:30", title: "妈妈 · 社区体检", participants: ["妈妈", "爸爸"], recipients: ["爸爸"], reminder: "已完成演示提醒", confirmed: true },
  { id: "fixture-parcel", dayKey: "today", dayLabel: "今天 · 周六", time: "18:40", title: "取快递", participants: ["我"], recipients: ["我"], reminder: "开始前提醒", confirmed: true },
  { id: "fixture-reading", dayKey: "tomorrow", dayLabel: "明天 · 周日", time: "16:00", title: "陪女儿去图书馆", participants: ["我", "女儿"], recipients: ["我", "女儿"], reminder: "提前 2 小时", confirmed: true },
];

const notificationReceipts = [
  { id: "receipt-fixture-1", eventTitle: "妈妈 · 社区体检", recipient: "爸爸", route: "飞书演示", state: "accepted", stateLabel: "演示接受", humanAck: "家人确认：无", time: "今天 08:30", evidence: "仅代表本地 Fixture 状态；无平台投递或阅读证据。" },
  { id: "receipt-fixture-2", eventTitle: "取快递", recipient: "我", route: "应用内演示", state: "queued", stateLabel: "本地排队", humanAck: "家人确认：无", time: "今天 18:10", evidence: "尚未触发真实消息；不代表已读或完成。" },
];

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let voiceMode = null;
let activeDraftId = 0;
let transcriptBeforeListening = "";

const escapeHtml = (value) =>
  String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);

const createEventMarkup = (event) => `
  <article class="schedule-event">
    <span class="event-day">${escapeHtml(event.dayLabel)}</span>
    <time>${escapeHtml(event.time)}</time>
    <div class="event-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.reminder)} · 已确认</small></div>
    <div class="event-members" aria-label="参与人：${escapeHtml(event.participants.join("、"))}">${event.participants.map((name) => `<span>${escapeHtml(name)}</span>`).join("")}</div>
  </article>`;

const renderTimeline = () => {
  const todayEvents = events.filter((event) => event.dayKey === "today");
  timeline.innerHTML = todayEvents.map((event) => `
    <article class="timeline-event">
      <time>${escapeHtml(event.time)}</time>
      <div><strong>${escapeHtml(event.title)}</strong><span>通知 ${escapeHtml(event.recipients.join("、"))}</span></div>
    </article>`).join("");
  eventCount.textContent = String(todayEvents.length);
};

const renderSchedule = () => {
  const day = scheduleDayFilter.value;
  const visibleEvents = events.filter((event) => {
    const matchesDay = day === "all" || event.dayKey === day || (day === "saturday" && event.dayKey === "today");
    const matchesMember = selectedMember === "all" || event.participants.includes(selectedMember);
    return matchesDay && matchesMember;
  });
  scheduleEventList.innerHTML = visibleEvents.length
    ? visibleEvents.map(createEventMarkup).join("")
    : `<div class="empty-state"><strong>当前筛选没有安排</strong><p>更换日期或成员，或者回到 Agent 创建一条待确认日程。</p><button type="button" data-create-with-agent>和 Agent 安排</button></div>`;
  scheduleTotalCount.textContent = String(events.length);
  scheduleTodayCount.textContent = String(events.filter((event) => event.dayKey === "today").length);
  scheduleNotificationCount.textContent = String(notificationReceipts.filter((receipt) => receipt.state === "queued").length);
};

const renderPeople = () => {
  peopleMemberList.innerHTML = members.map((member) => `
    <article class="member-row">
      <img class="person-avatar" data-role-avatar="${escapeHtml(member.role)}" src="${escapeHtml(member.avatar)}" alt="" aria-hidden="true" />
      <div><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.availability)}</small></div>
      <div class="route-state"><span class="${member.configured ? "" : "unavailable"}">${escapeHtml(member.route)}</span><small>${member.configured ? "本地演示路径" : "无可用演示路径"}</small></div>
    </article>`).join("");
  notificationReceiptList.innerHTML = notificationReceipts.length
    ? notificationReceipts.map((receipt) => `
      <article class="notification-receipt">
        <i class="receipt-status ${receipt.state}" aria-hidden="true"></i>
        <div><strong>${escapeHtml(receipt.eventTitle)} → ${escapeHtml(receipt.recipient)}</strong><small>${escapeHtml(receipt.route)} · ${escapeHtml(receipt.stateLabel)} · ${escapeHtml(receipt.humanAck)}</small><small class="evidence-note">${escapeHtml(receipt.evidence)}</small></div>
        <time>${escapeHtml(receipt.time)}</time>
      </article>`).join("")
    : `<div class="empty-state"><strong>还没有通知回执</strong><p>确认一条包含通知对象的日程后，这里会显示本地演示证据。</p><button type="button" data-create-with-agent>和 Agent 安排</button></div>`;
  receiptTotalCount.textContent = `${notificationReceipts.length} 条`;
};

const renderSharedState = () => {
  renderTimeline();
  renderSchedule();
  renderPeople();
};

const showToast = (message) => {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 3600);
};

const roleLabel = (memberId) => responsibilityRoles[memberId]?.label ?? memberId ?? "—";

const updateResponsibilityIdentity = () => {
  const role = responsibilityRoles[responsibilityRole.value];
  if (!role) return;
  profileName.textContent = `${role.label}视角`;
  profileAvatar.src = role.avatar;
  profileAvatar.alt = `${role.label}头像`;
  spaceAvatar.src = role.avatar;
  document.querySelectorAll(".responsibility-suggestion-message").forEach((message) => {
    message.hidden = responsibilityRole.value !== "mother";
  });
};

const responsibilityNoticeCopy = (data) => {
  const { actorId, flow, summary } = data;
  if (flow === "accepted" && actorId === "mother" && summary.oldOwnerNotices > 0) {
    return "交接已接受：你不再接收这块责任的默认行动提醒。";
  }
  if (flow === "accepted" && actorId === "father") return "你已接受整块责任，未来行动提醒已迁移给你。";
  if (flow === "accepted_todo_completed") return "下一步 Todo 已完成，对应提醒已停止。";
  if (flow === "declined") return "爸爸拒绝了提案，负责人和默认提醒仍是妈妈。";
  if (flow === "analyzed") return "AI 只生成责任建议；责任、提醒和共享范围尚未改变。";
  return "责任仍由妈妈负责。Demo 使用固定 Fixture，不保存家庭数据或发送外部通知。";
};

const renderResponsibilityState = (data) => {
  responsibilityState.data = data;
  const { summary } = data;
  responsibilityOwner.textContent = roleLabel(summary.accountableOwnerId);
  responsibilityHandoverStatus.textContent = responsibilityStatusLabels[summary.handoverStatus] ?? summary.handoverStatus ?? "—";
  responsibilityTodoOwner.textContent = summary.todoStatus === "completed"
    ? "已完成"
    : roleLabel(summary.todoAssigneeId);
  responsibilityReminderOwner.textContent = summary.reminderRecipientId
    ? roleLabel(summary.reminderRecipientId)
    : "当前视角无待提醒";
  responsibilityNotice.textContent = responsibilityNoticeCopy(data);
  responsibilityDemo.dataset.flow = data.flow;
  updateResponsibilityIdentity();
};

const requestResponsibility = async (action, actorId, text = responsibilityState.text) => {
  const options = action === "read"
    ? undefined
    : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "reset"
        ? { action, actorId }
        : { action, actorId, text }),
    };
  const path = action === "read"
    ? `/api/responsibility?actor=${encodeURIComponent(actorId)}`
    : "/api/responsibility";
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error?.code ?? "request_failed");
  return payload;
};

const executeResponsibilityAction = async (action, text = responsibilityState.text) => {
  responsibilityDemo.dataset.busy = "true";
  try {
    const actorId = responsibilityRole.value;
    const payload = await requestResponsibility(action, actorId, text);
    responsibilityState.action = action;
    responsibilityState.text = text;
    renderResponsibilityState(payload);
    showToast(action === "reset" ? "责任交接演示已重置" : "责任规则引擎已返回最新视角");
    return payload;
  } catch {
    responsibilityNotice.textContent = "演示服务未连接。请通过项目启动命令访问本页。";
    showToast("责任交接 API 暂时不可用");
    return null;
  } finally {
    responsibilityDemo.dataset.busy = "false";
  }
};

const refreshResponsibilityRole = async () => {
  responsibilityDemo.dataset.busy = "true";
  try {
    const actorId = responsibilityRole.value;
    const action = responsibilityState.action === "reset"
      || (responsibilityState.action === "analyze" && actorId !== "mother")
      ? "read"
      : responsibilityState.action;
    renderResponsibilityState(await requestResponsibility(action, actorId));
  } catch {
    responsibilityNotice.textContent = "无法加载该成员视角；当前页面不会猜测或显示其他人的私人内容。";
  } finally {
    responsibilityDemo.dataset.busy = "false";
  }
};

const appendResponsibilitySuggestion = (payload) => {
  const suggestion = payload?.suggestion?.suggestion;
  if (!suggestion) return;
  const wrapper = document.createElement("div");
  wrapper.className = "message agent-message responsibility-suggestion-message";
  wrapper.innerHTML = `
    <span class="agent-orb" aria-hidden="true">✦</span>
    <div>
      <div class="message-body"><strong>责任 Agent</strong><p>我区分了可共享事实、私人表达和责任诉求。以下私人表达只在妈妈视角显示。</p></div>
      <article class="responsibility-suggestion-card" aria-label="责任交接建议">
        <h3>${escapeHtml(suggestion.domainSuggestion)}</h3>
        <dl>
          <dt>可共享事实</dt><dd>${escapeHtml(suggestion.shareableFacts.join("；"))}</dd>
          <dt>私人表达</dt><dd>${escapeHtml(suggestion.privateExpressions.join("；"))}</dd>
          <dt>责任诉求</dt><dd>${escapeHtml(suggestion.responsibilityRequests.join("；"))}</dd>
          <dt>建议接手人</dt><dd>${escapeHtml(roleLabel(suggestion.proposedOwnerId))}</dd>
        </dl>
        <button type="button" data-run-golden-handover>生成提案并演示双方接受</button>
      </article>
    </div>`;
  wrapper.querySelector("[data-run-golden-handover]").addEventListener("click", () => {
    executeResponsibilityAction("goldenFlow");
  });
  feed.append(wrapper);
};

const analyzeResponsibilityMessage = async (text) => {
  responsibilityRole.value = "mother";
  updateResponsibilityIdentity();
  const payload = await executeResponsibilityAction("analyze", text);
  if (payload) appendResponsibilitySuggestion(payload);
};

const autosize = () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
};

const formatDraft = (text) => {
  const hasDinner = /吃饭|晚餐/.test(text);
  const hasCheckup = /复诊|体检|医院|看病/.test(text);
  const title = hasDinner ? "全家一起吃晚餐" : hasCheckup ? "带妈妈复诊" : text.replace(/[，。,.].*$/, "").slice(0, 24) || "新日程";
  const time = /七点|7点|19[:：]?00/.test(text) ? "19:00" : /三点|3点|15[:：]?00/.test(text) ? "15:00" : "待确认";
  const day = /明晚|明天/.test(text) ? "明天" : /周六|星期六/.test(text) ? "周六" : "今天";
  const dayKey = /明晚|明天/.test(text) ? "tomorrow" : "today";
  const dayLabel = dayKey === "tomorrow" ? "明天 · 周日" : "今天 · 周六";
  const recipients = /所有人|全家/.test(text) ? ["我", "妈妈", "爸爸", "女儿", "儿子", "奶奶"] : /爸爸|爸/.test(text) ? ["我", "爸爸"] : ["我"];
  const reminder = /一天|24小时/.test(text) ? "提前 1 天" : /两小时|2小时/.test(text) ? "提前 2 小时" : "开始前提醒";
  const participants = hasCheckup ? ["我", "妈妈"] : hasDinner ? ["我", "妈妈", "爸爸", "女儿", "儿子", "奶奶"] : ["我"];

  return { title, time, day, dayKey, dayLabel, recipients, reminder, participants };
};

const appendUserMessage = (text) => {
  const wrapper = document.createElement("div");
  wrapper.className = "message user-message";
  wrapper.innerHTML = `<div class="message-body"><p>${escapeHtml(text)}</p></div>`;
  feed.append(wrapper);
};

const appendTimelineEvent = (draft) => {
  const eventId = `confirmed-${Date.now()}`;
  events.push({ ...draft, id: eventId, confirmed: true });
  return eventId;
};

const appendDraft = (draft) => {
  const draftId = ++activeDraftId;
  const wrapper = document.createElement("div");
  wrapper.className = "message agent-message";
  wrapper.dataset.draftId = String(draftId);
  wrapper.innerHTML = `
    <span class="agent-orb" aria-hidden="true">✦</span>
    <div>
      <div class="message-body"><strong>时间 Agent</strong><p>我整理成了下面的安排。确认后才会写入时间表并通知相关人。</p></div>
      <article class="draft-card" aria-label="待确认日程">
        <div class="draft-top">
          <div><span class="draft-label">● 待你确认</span><h3>${escapeHtml(draft.title)}</h3></div>
          <div class="draft-time"><span>${escapeHtml(draft.day)}</span><strong>${escapeHtml(draft.time)}</strong></div>
        </div>
        <div class="draft-details">
          <div class="draft-detail"><span>参与人</span><strong>${escapeHtml(draft.participants.join("、"))}</strong></div>
          <div class="draft-detail"><span>通知</span><strong>${escapeHtml(draft.recipients.join("、"))}</strong></div>
          <div class="draft-detail"><span>提醒</span><strong>${escapeHtml(draft.reminder)}</strong></div>
        </div>
        <div class="draft-actions">
          <button class="edit-draft" type="button">修改</button>
          <button class="confirm-draft" type="button">确认并同步</button>
        </div>
      </article>
    </div>`;

  wrapper.querySelector(".edit-draft").addEventListener("click", () => {
    input.value = `${draft.day}${draft.time} ${draft.title}，通知${draft.recipients.join("和")}，${draft.reminder}`;
    autosize();
    input.focus();
    showToast("已放回输入框，修改后重新发送即可");
  });

  wrapper.querySelector(".confirm-draft").addEventListener("click", (event) => {
    if (wrapper.dataset.confirmed === "true") return;
    wrapper.dataset.confirmed = "true";
    event.currentTarget.textContent = "已同步";
    event.currentTarget.disabled = true;
    wrapper.querySelector(".draft-label").textContent = "✓ 已确认";
    wrapper.querySelector(".edit-draft").remove();
    const eventId = appendTimelineEvent(draft);
    draft.recipients.forEach((recipient, index) => {
      const member = members.find((candidate) => candidate.name === recipient);
      notificationReceipts.unshift({
        id: `${eventId}-${index}`,
        eventTitle: draft.title,
        recipient,
        route: member?.configured ? member.route : "未配置",
        state: "queued",
        stateLabel: "本地排队",
        humanAck: "家人确认：无",
        time: "刚刚",
        evidence: member?.configured
          ? "仅生成本地演示回执；未调用平台，也没有送达或阅读证据。"
          : "该成员没有演示路径；没有尝试真实投递。",
      });
    });
    renderSharedState();
    receiptCopy.textContent = `已为 ${draft.recipients.join("、")}生成“${draft.reminder}”本地排队记录，未调用真实平台。`;
    receiptCard.hidden = false;
    showToast("日程已同步，通知回执已生成（交互原型）");
  });

  feed.append(wrapper);
};

const sendMessage = (text, source = "text") => {
  const cleanText = text.trim();
  if (!cleanText) return;
  appendUserMessage(cleanText);
  input.value = "";
  autosize();
  if (/责任|交接|接手|负担|撑不住|奶奶.*复诊/u.test(cleanText)) {
    window.setTimeout(() => analyzeResponsibilityMessage(cleanText), source === "voice_message" ? 280 : 180);
    return;
  }
  window.setTimeout(() => {
    appendDraft(formatDraft(cleanText));
    feed.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, source === "voice_message" ? 280 : 180);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("input", autosize);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

responsibilityRole.addEventListener("change", () => {
  updateResponsibilityIdentity();
  refreshResponsibilityRole();
});

document.querySelectorAll("[data-responsibility-action]").forEach((button) => {
  button.addEventListener("click", () => executeResponsibilityAction(button.dataset.responsibilityAction));
});

const finishVoice = () => {
  if (!recognition) return;
  recognition.stop();
};

const setVoiceUi = (active, label = "正在听…") => {
  voiceState.hidden = !active;
  voiceStateLabel.textContent = label;
  document.querySelector(".app-shell").dataset.appState = active ? "listening" : "idle";
};

const startVoice = (mode) => {
  if (!SpeechRecognition) {
    showToast("当前浏览器不支持语音识别。请使用最新版 Chrome，或接入服务端音频转写接口。");
    return;
  }
  if (recognition) {
    finishVoice();
    return;
  }

  voiceMode = mode;
  transcriptBeforeListening = mode === "dictation" ? input.value.trim() : "";
  let finalTranscript = "";
  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.addEventListener("start", () => {
    setVoiceUi(true, mode === "voice_message" ? "正在录制语音，完成后自动发送…" : "正在听，文字会出现在输入框…");
  });

  recognition.addEventListener("result", (event) => {
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalTranscript += transcript;
      else interimTranscript += transcript;
    }
    input.value = [transcriptBeforeListening, finalTranscript || interimTranscript].filter(Boolean).join(" ");
    autosize();
  });

  recognition.addEventListener("error", (event) => {
    const messages = {
      "not-allowed": "没有麦克风权限。请在浏览器地址栏允许后重试。",
      "no-speech": "没有识别到语音，请靠近麦克风重试。",
      network: "语音识别网络不可用，没有创建日程。",
    };
    showToast(messages[event.error] || "语音识别失败，没有创建日程。");
  });

  recognition.addEventListener("end", () => {
    const completedMode = voiceMode;
    const completedText = input.value;
    recognition = null;
    voiceMode = null;
    setVoiceUi(false);
    if (completedMode === "voice_message" && completedText.trim()) sendMessage(completedText, "voice_message");
    else if (completedText.trim()) input.focus();
  });

  try {
    recognition.start();
  } catch {
    recognition = null;
    setVoiceUi(false);
    showToast("语音识别暂时无法启动，请稍后重试。");
  }
};

dictateButton.addEventListener("click", () => startVoice("dictation"));
voiceMessageButton.addEventListener("click", () => startVoice("voice_message"));
stopVoiceButton.addEventListener("click", finishVoice);

const setActiveNavigation = (view) => {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
};

const setActiveView = (view, { focusHeading = true } = {}) => {
  if (!new Set(["agent", "schedule", "people"]).has(view)) return;
  activeView = view;
  document.querySelectorAll(".app-view").forEach((section) => {
    section.hidden = section.id !== `${view}-view`;
  });
  appShell.dataset.activeView = view;
  setActiveNavigation(view);
  if (view === "schedule") renderSchedule();
  if (view === "people") renderPeople();
  if (focusHeading) {
    const heading = document.querySelector(`#${view}-view h1`);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: "auto" });
};

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    if (view === "integrations") {
      setActiveNavigation(view);
      integrationsDialog.showModal();
      return;
    }
    setActiveView(view);
  });
});

document.addEventListener("click", (event) => {
  const createButton = event.target.closest("[data-create-with-agent]");
  if (!createButton) return;
  setActiveView("agent");
  input.focus();
});

scheduleDayFilter.addEventListener("change", renderSchedule);
document.querySelectorAll("[data-member-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedMember = button.dataset.memberFilter;
    document.querySelectorAll("[data-member-filter]").forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    });
    renderSchedule();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => integrationsDialog.close());
});

integrationsDialog.addEventListener("click", (event) => {
  if (event.target === integrationsDialog) integrationsDialog.close();
});

integrationsDialog.addEventListener("close", () => setActiveNavigation(activeView));

document.querySelectorAll("[data-channel-detail]").forEach((button) => {
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    const detail = document.querySelector(`[data-detail="${button.dataset.channelDetail}"]`);
    const willOpen = detail.hidden;
    detail.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  });
});

document.body.dataset.sessionStatus = "ready";
renderSharedState();
setActiveView("agent", { focusHeading: false });
autosize();
refreshResponsibilityRole();
