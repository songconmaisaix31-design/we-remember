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
const authGate = document.querySelector("#auth-gate");
const appShell = document.querySelector(".app-shell");
const feishuSignInButton = document.querySelector("#feishu-sign-in");
const continueToAvatarButton = document.querySelector("#continue-to-avatar");
const enterFamilySpaceButton = document.querySelector("#enter-family-space");
const signOutButton = document.querySelector("#sign-out-button");
const modeSwitch = document.querySelector("#mode-switch");
const modeSwitchLabel = document.querySelector("#mode-switch-label");
const profileAvatar = document.querySelector("#profile-avatar");
const spaceAvatar = document.querySelector("#space-avatar");
const profileRole = document.querySelector("#profile-role");
const profileSpace = document.querySelector("#profile-space");
const workspaceEyebrow = document.querySelector("#workspace-eyebrow");
const workspaceTitle = document.querySelector("#workspace-title");
const workspaceSubtitle = document.querySelector("#workspace-subtitle");
const modeNotice = document.querySelector("#mode-notice");
const showNoMatchButton = document.querySelector("#show-no-match");
const hideNoMatchButton = document.querySelector("#hide-no-match");
const noMatchState = document.querySelector("#no-match-state");
const spaceOptions = document.querySelector(".space-options");

const DEMO_SESSION_KEY = "we-remember-demo-session-v1";
const ROLE_ASSETS = Object.freeze({
  mother: { label: "妈妈", family: "居家烹饪", work: "办公室职业人" },
  father: { label: "爸爸", family: "家庭修缮", work: "现场工程师" },
  daughter: { label: "女儿", family: "居家阅读", work: "实验室科学家" },
  son: { label: "儿子", family: "滑板休闲", work: "摄影师" },
  grandfather: { label: "爷爷", family: "日常生活", work: "教师与导师" },
  grandmother: { label: "奶奶", family: "居家编织", work: "专业裁缝" },
});
const SPACE_FIXTURES = Object.freeze({
  "family-home": { name: "我们的家", memberCount: 6 },
  "care-group": { name: "长辈照护群", memberCount: 4 },
});

let selectedSpaceId = null;
let selectedRole = null;
let activeSession = null;
let visualTransitionRevision = 0;

const roleAssetPath = (role, state) => `assets/family-work/${role}/${state}.svg`;

const readDemoSession = () => {
  try {
    const candidate = JSON.parse(window.sessionStorage.getItem(DEMO_SESSION_KEY));
    if (!candidate || !SPACE_FIXTURES[candidate.spaceId] || !ROLE_ASSETS[candidate.role]) return null;
    if (!new Set(["family", "work"]).has(candidate.mode)) return null;
    return { spaceId: candidate.spaceId, role: candidate.role, mode: candidate.mode };
  } catch {
    return null;
  }
};

const persistDemoSession = () => {
  if (!activeSession) return;
  window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(activeSession));
};

const setAuthStep = (step) => {
  document.querySelectorAll(".auth-step").forEach((element) => {
    element.hidden = element.id !== `${step}-step`;
  });
  document.querySelectorAll("[data-auth-progress]").forEach((element) => {
    element.classList.toggle("is-current", element.dataset.authProgress === step);
  });
};

const updateSessionPresentation = ({ animate = false, fromMode = null } = {}) => {
  if (!activeSession) return;
  const role = ROLE_ASSETS[activeSession.role];
  const space = SPACE_FIXTURES[activeSession.spaceId];
  const destination = activeSession.mode;
  const staticPath = roleAssetPath(activeSession.role, destination);
  const transitionPath = fromMode ? roleAssetPath(activeSession.role, `${fromMode}-to-${destination}`) : staticPath;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revision = ++visualTransitionRevision;

  profileRole.textContent = role.label;
  profileSpace.textContent = `${space.name} · ${space.memberCount} 人`;
  modeSwitchLabel.textContent = destination === "family" ? "家庭空间" : "工作空间";
  modeSwitch.setAttribute("aria-label", destination === "family" ? "切换到工作空间" : "切换到家庭空间");
  workspaceEyebrow.textContent = destination === "family" ? "FAMILY SPACE · SATURDAY" : "WORKSPACE PREVIEW · SATURDAY";
  workspaceTitle.textContent = destination === "family" ? "今天想安排什么？" : "今天想推进什么？";
  workspaceSubtitle.textContent = destination === "family"
    ? "直接告诉 Agent。时间、参与人和提醒方式会先由你确认。"
    : `${role.work}形象已启用。工作空间能力会在后续版本接入。`;
  modeNotice.hidden = destination !== "work";
  appShell.dataset.visualMode = destination;

  const displayPath = animate && !prefersReducedMotion ? `${transitionPath}?play=${revision}` : staticPath;
  profileAvatar.src = displayPath;
  profileAvatar.alt = `${role.label}的${destination === "family" ? "家庭" : "工作"}形象`;
  spaceAvatar.src = displayPath;

  if (animate && !prefersReducedMotion) {
    window.setTimeout(() => {
      if (revision !== visualTransitionRevision || !activeSession || activeSession.mode !== destination) return;
      profileAvatar.src = staticPath;
      spaceAvatar.src = staticPath;
    }, 2450);
  }
};

const showApplication = (session) => {
  activeSession = session;
  authGate.hidden = true;
  appShell.hidden = false;
  document.body.dataset.sessionStatus = "ready";
  updateSessionPresentation();
};

const showSignIn = () => {
  activeSession = null;
  selectedSpaceId = null;
  selectedRole = null;
  document.querySelectorAll(".space-option, .role-option").forEach((element) => element.setAttribute("aria-checked", "false"));
  continueToAvatarButton.disabled = true;
  enterFamilySpaceButton.disabled = true;
  appShell.hidden = true;
  authGate.hidden = false;
  document.body.dataset.sessionStatus = "signed-out";
  setAuthStep("login");
};

feishuSignInButton.addEventListener("click", () => {
  noMatchState.hidden = true;
  spaceOptions.hidden = false;
  showNoMatchButton.hidden = false;
  setAuthStep("space");
  document.querySelector(".space-option")?.focus();
});

showNoMatchButton.addEventListener("click", () => {
  selectedSpaceId = null;
  document.querySelectorAll(".space-option").forEach((option) => option.setAttribute("aria-checked", "false"));
  noMatchState.hidden = false;
  spaceOptions.hidden = true;
  showNoMatchButton.hidden = true;
  continueToAvatarButton.disabled = true;
});

hideNoMatchButton.addEventListener("click", () => {
  noMatchState.hidden = true;
  spaceOptions.hidden = false;
  showNoMatchButton.hidden = false;
});

document.querySelectorAll(".space-option").forEach((button) => {
  button.addEventListener("click", () => {
    selectedSpaceId = button.dataset.spaceId;
    document.querySelectorAll(".space-option").forEach((option) => option.setAttribute("aria-checked", String(option === button)));
    continueToAvatarButton.disabled = false;
  });
});

continueToAvatarButton.addEventListener("click", () => {
  if (!selectedSpaceId) return;
  setAuthStep("avatar");
  document.querySelector(".role-option")?.focus();
});

document.querySelectorAll(".role-option").forEach((button) => {
  button.addEventListener("click", () => {
    selectedRole = button.dataset.role;
    document.querySelectorAll(".role-option").forEach((option) => option.setAttribute("aria-checked", String(option === button)));
    enterFamilySpaceButton.disabled = false;
  });
});

enterFamilySpaceButton.addEventListener("click", () => {
  if (!selectedSpaceId || !selectedRole) return;
  const session = { spaceId: selectedSpaceId, role: selectedRole, mode: "family" };
  activeSession = session;
  persistDemoSession();
  showApplication(session);
  showToast("已进入匹配到的家庭空间（本地演示）");
});

document.querySelectorAll("[data-auth-back]").forEach((button) => {
  button.addEventListener("click", () => setAuthStep(button.dataset.authBack));
});

signOutButton.addEventListener("click", () => {
  window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  showSignIn();
});

modeSwitch.addEventListener("click", () => {
  if (!activeSession) return;
  const fromMode = activeSession.mode;
  activeSession = { ...activeSession, mode: fromMode === "family" ? "work" : "family" };
  persistDemoSession();
  updateSessionPresentation({ animate: true, fromMode });
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let voiceMode = null;
let activeDraftId = 0;
let transcriptBeforeListening = "";

const escapeHtml = (value) =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);

const showToast = (message) => {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 3600);
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
  const day = /明晚|明天/.test(text) ? "明天" : /周六|星期六/.test(text) ? "周六" : "日期待确认";
  const recipients = /所有人|全家/.test(text) ? ["我", "爸爸", "女儿", "儿子"] : /爸爸|爸/.test(text) ? ["我", "爸爸"] : ["我"];
  const reminder = /一天|24小时/.test(text) ? "提前 1 天" : /两小时|2小时/.test(text) ? "提前 2 小时" : "开始前提醒";
  const participants = hasCheckup ? "我、妈妈" : hasDinner ? "全家" : "我";

  return { title, time, day, recipients, reminder, participants };
};

const appendUserMessage = (text) => {
  const wrapper = document.createElement("div");
  wrapper.className = "message user-message";
  wrapper.innerHTML = `<div class="message-body"><p>${escapeHtml(text)}</p></div>`;
  feed.append(wrapper);
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
          <div class="draft-detail"><span>参与人</span><strong>${escapeHtml(draft.participants)}</strong></div>
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
    appendTimelineEvent(draft);
    receiptCopy.textContent = `${draft.recipients.join("、")}将按“${draft.reminder}”收到演示通知。`;
    receiptCard.hidden = false;
    showToast("日程已同步，通知回执已生成（交互原型）");
  });

  feed.append(wrapper);
};

const appendTimelineEvent = (draft) => {
  const event = document.createElement("article");
  event.className = "timeline-event";
  event.innerHTML = `<time>${escapeHtml(draft.time)}</time><div><strong>${escapeHtml(draft.title)}</strong><span>通知 ${escapeHtml(draft.recipients.join("、"))}</span></div>`;
  timeline.append(event);
  eventCount.textContent = String(timeline.children.length);
};

const sendMessage = (text, source = "text") => {
  const cleanText = text.trim();
  if (!cleanText) return;
  appendUserMessage(cleanText);
  input.value = "";
  autosize();
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
    button.classList.toggle("is-active", button.dataset.view === view);
  });
};

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    if (view === "integrations") {
      setActiveNavigation(view);
      integrationsDialog.showModal();
      return;
    }
    setActiveNavigation("agent");
    if (view !== "agent") showToast("本轮先验证对话式创建主流程；该入口尚未连接独立页面。");
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => integrationsDialog.close());
});

integrationsDialog.addEventListener("click", (event) => {
  if (event.target === integrationsDialog) integrationsDialog.close();
});

integrationsDialog.addEventListener("close", () => setActiveNavigation("agent"));

document.querySelectorAll("[data-channel-detail]").forEach((button) => {
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    const detail = document.querySelector(`[data-detail="${button.dataset.channelDetail}"]`);
    const willOpen = detail.hidden;
    detail.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  });
});

const restoredSession = readDemoSession();
if (restoredSession) showApplication(restoredSession);
else showSignIn();

autosize();
