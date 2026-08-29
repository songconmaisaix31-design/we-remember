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
const familyKeyForm = document.querySelector("#key-step");
const familyKeyInput = document.querySelector("#family-key-input");
const keyError = document.querySelector("#key-error");
const continueToAvatarButton = document.querySelector("#continue-to-avatar");
const enterFamilySpaceButton = document.querySelector("#enter-family-space");
const avatarUpload = document.querySelector("#avatar-upload");
const avatarUploadStatus = document.querySelector("#avatar-upload-status");
const signOutButton = document.querySelector("#sign-out-button");
const profileAvatar = document.querySelector("#profile-avatar");
const spaceAvatar = document.querySelector("#space-avatar");
const profileSpace = document.querySelector("#profile-space");
const DEMO_SESSION_KEY = "we-remember-demo-session-v2";
const DEMO_FAMILY_KEY = "DEMO-HOME";
const AVATAR_IDS = new Set(["coral", "sage", "blue", "gold"]);

let selectedAvatar = null;
let activeSession = null;

const readDemoSession = () => {
  try {
    const candidate = JSON.parse(window.sessionStorage.getItem(DEMO_SESSION_KEY));
    if (!candidate || candidate.familyId !== "demo-family" || !candidate.avatar) return null;
    if (candidate.avatar.kind === "preset" && AVATAR_IDS.has(candidate.avatar.id)) return candidate;
    if (candidate.avatar.kind === "upload" && /^data:image\/(png|jpeg|webp);base64,/.test(candidate.avatar.dataUrl)) return candidate;
    return null;
  } catch {
    return null;
  }
};

const persistDemoSession = () => {
  if (!activeSession) return;
  try {
    window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(activeSession));
  } catch {
    showToast("头像已用于当前页面，但图片较大，刷新后需要重新选择。");
  }
};

const setAuthStep = (step) => {
  document.querySelectorAll(".auth-step").forEach((element) => {
    element.hidden = element.id !== `${step}-step`;
  });
  document.querySelectorAll("[data-auth-progress]").forEach((element) => {
    element.classList.toggle("is-current", element.dataset.authProgress === step);
  });
};

const applyAvatar = (element, avatar) => {
  element.className = "custom-avatar";
  element.style.backgroundImage = "";
  element.textContent = "我";
  if (avatar.kind === "upload") {
    element.classList.add("uploaded");
    element.style.backgroundImage = `url(${JSON.stringify(avatar.dataUrl).slice(1, -1)})`;
    element.textContent = "";
    return;
  }
  element.classList.add(avatar.id);
};

const updateSessionPresentation = () => {
  if (!activeSession) return;
  profileSpace.textContent = "我们的家 · 6 人";
  applyAvatar(profileAvatar, activeSession.avatar);
  applyAvatar(spaceAvatar, activeSession.avatar);
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
  selectedAvatar = null;
  familyKeyForm.reset();
  keyError.hidden = true;
  avatarUploadStatus.textContent = "PNG、JPEG 或 WebP，最大 2 MB；本地预览不会上传";
  document.querySelectorAll(".avatar-option").forEach((element) => element.setAttribute("aria-checked", "false"));
  enterFamilySpaceButton.disabled = true;
  appShell.hidden = true;
  authGate.hidden = false;
  document.body.dataset.sessionStatus = "signed-out";
  setAuthStep("key");
};

familyKeyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (familyKeyInput.value.trim().toUpperCase() !== DEMO_FAMILY_KEY) {
    keyError.hidden = false;
    familyKeyInput.setAttribute("aria-invalid", "true");
    return;
  }
  keyError.hidden = true;
  familyKeyInput.removeAttribute("aria-invalid");
  familyKeyInput.value = "";
  setAuthStep("family");
  continueToAvatarButton.focus();
});

continueToAvatarButton.addEventListener("click", () => {
  setAuthStep("avatar");
  document.querySelector(".avatar-option")?.focus();
});

document.querySelectorAll(".avatar-option").forEach((button) => {
  button.addEventListener("click", () => {
    selectedAvatar = { kind: "preset", id: button.dataset.avatarId };
    avatarUpload.value = "";
    avatarUploadStatus.textContent = "PNG、JPEG 或 WebP，最大 2 MB；本地预览不会上传";
    document.querySelectorAll(".avatar-option").forEach((option) => option.setAttribute("aria-checked", String(option === button)));
    enterFamilySpaceButton.disabled = false;
  });
});

avatarUpload.addEventListener("change", () => {
  const file = avatarUpload.files?.[0];
  if (!file) return;
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type) || file.size > 2 * 1024 * 1024) {
    avatarUpload.value = "";
    avatarUploadStatus.textContent = "请选择 2 MB 以内的 PNG、JPEG 或 WebP 图片。";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedAvatar = { kind: "upload", dataUrl: String(reader.result) };
    document.querySelectorAll(".avatar-option").forEach((option) => option.setAttribute("aria-checked", "false"));
    avatarUploadStatus.textContent = `已选择 ${file.name} · 仅在本地预览`;
    enterFamilySpaceButton.disabled = false;
  }, { once: true });
  reader.readAsDataURL(file);
});

enterFamilySpaceButton.addEventListener("click", () => {
  if (!selectedAvatar) return;
  const session = { familyId: "demo-family", avatar: selectedAvatar };
  activeSession = session;
  persistDemoSession();
  showApplication(session);
  showToast("已进入匹配到的家庭（本地演示）");
});

document.querySelectorAll("[data-auth-back]").forEach((button) => {
  button.addEventListener("click", () => setAuthStep(button.dataset.authBack));
});

signOutButton.addEventListener("click", () => {
  window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  showSignIn();
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
