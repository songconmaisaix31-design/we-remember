import json
import re
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "app" / "styles.css").read_text(encoding="utf-8")
JS = (ROOT / "app" / "app.js").read_text(encoding="utf-8")
OPENAPI = (ROOT / "contracts" / "channel-gateway.openapi.yaml").read_text(encoding="utf-8")
GATEWAY_DOC = (ROOT / "docs" / "integration-gateway.md").read_text(encoding="utf-8")
AVATAR_ASSET_ROOT = ROOT / "app" / "assets" / "family-work"
BRAND_ASSET_ROOT = ROOT / "app" / "assets" / "brand"
ROBOT_ROOT = ROOT / "modules" / "robot"
ROBOT_CONTRACTS = (ROBOT_ROOT / "src" / "contracts.ts").read_text(encoding="utf-8")
ROBOT_A3 = (ROBOT_ROOT / "src" / "a3-http-adapter.ts").read_text(encoding="utf-8")
ROBOT_SERVICE = (ROBOT_ROOT / "src" / "notification-service.ts").read_text(encoding="utf-8")
ROBOT_DOC = (ROOT / "docs" / "robot-a3-integration.md").read_text(encoding="utf-8")
ROBOT_PACKAGE = json.loads((ROBOT_ROOT / "package.json").read_text(encoding="utf-8"))


def require(source: str, fragment: str, reason: str) -> None:
    if fragment not in source:
        raise AssertionError(f"Missing {reason}: {fragment}")


for file_name in ("PRD.md", "Tech-Spec.md", "API-CONTRACT.md", "README.md"):
    if not (ROOT / file_name).is_file():
        raise AssertionError(f"Missing project document: {file_name}")

require(HTML, 'id="agent-input"', "natural-language composer")
require(HTML, 'id="dictate-button"', "live dictation action")
require(HTML, 'id="voice-message-button"', "auto-send voice message action")
require(HTML, 'id="timeline"', "schedule timeline")
require(HTML, 'id="receipt-card"', "notification receipt")
require(HTML, 'id="integrations-dialog"', "connection center dialog")
require(HTML, 'id="agent-view"', "Agent destination")
require(HTML, 'id="schedule-view"', "family schedule destination")
require(HTML, 'id="people-view"', "family and notifications destination")
require(HTML, 'id="schedule-day-filter"', "schedule day filter")
require(HTML, 'data-member-filter', "schedule member filters")
require(HTML, 'id="schedule-event-list"', "shared schedule event list")
require(HTML, 'id="people-member-list"', "family member list")
require(HTML, 'id="notification-receipt-list"', "notification receipt list")
require(HTML, 'class="schedule-panel surface lift-card"', "schedule container elevation")
require(HTML, 'class="people-panel surface lift-card"', "people container elevation")
require(HTML, 'class="receipts-panel surface lift-card"', "receipt container elevation")
require(HTML, 'data-create-with-agent', "route back to Agent")
require(HTML, 'id="demo-login"', "username-only demo login gate")
require(HTML, 'id="demo-username"', "demo username input")
require(HTML, 'id="demo-login-error"', "login error live region")
require(HTML, 'id="demo-sign-out"', "demo sign-out control")
require(HTML, 'class="app-shell" data-app-state="idle" hidden inert>', "signed-out inert application shell")
require(HTML, 'class="brand-intro" id="brand-intro" aria-hidden="true"', "one-shot brand opening")
require(HTML, 'src="assets/brand/mom-to-we-remember.svg" alt=""', "opening animation asset")
require(HTML, 'class="brand-logo" src="assets/brand/we-remember-logo.svg" alt="We Remember"', "static brand logo")
require(HTML, 'id="profile-avatar" data-role-avatar="self" src="assets/family-work/mother/work.svg"', "working-woman default avatar")
require(HTML, 'data-role-avatar="father" src="assets/family-work/father/family.svg"', "father role avatar")
require(JS, 'role: "mother", avatar: "assets/family-work/mother/family.svg"', "mother role avatar mapping")
require(JS, 'role: "son", avatar: "assets/family-work/son/family.svg"', "son role avatar mapping")
require(JS, 'role: "grandmother", avatar: "assets/family-work/grandmother/family.svg"', "grandmother role avatar mapping")
require(HTML, 'data-channel="wecom"', "WeCom connector")
require(HTML, 'data-channel="wechat-clawbot"', "personal WeChat ClawBot connector")
require(HTML, 'data-channel="feishu"', "Feishu connector")
require(HTML, 'data-channel="dingtalk"', "DingTalk connector")
require(HTML, 'data-channel="custom-bot"', "custom bot connector")
require(JS, "window.SpeechRecognition || window.webkitSpeechRecognition", "speech capability detection")
require(JS, 'mode === "voice_message"', "voice auto-send branch")
require(JS, 'dataset.confirmed = "true"', "confirmation gate")
require(JS, "appendTimelineEvent(draft)", "confirmed schedule sync")
require(JS, "setActiveView", "shared application view routing")
require(JS, 'DEMO_SESSION_STORAGE_KEY = "we-remember.demo-session.v1"', "versioned demo session key")
require(JS, 'window.sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY', "same-tab demo session storage")
require(JS, 'profileName.textContent = username', "safe username rendering")
require(JS, 'actorId: "mother"', "fixed responsibility fixture actor")
require(JS, 'appShell.inert = true', "signed-out shell focus isolation")
require(JS, 'window.location.reload()', "safe sign-out runtime reset")
require(CSS, "@media (max-width: 520px)", "mobile breakpoint")
require(CSS, "@media (prefers-reduced-motion: reduce)", "reduced-motion support")
require(CSS, "translateY(-4px)", "reference-inspired card lift")
require(CSS, ".schedule-panel, .people-panel, .receipts-panel { border-radius: 28px; }", "rounded primary detail containers")
require(CSS, "width: min(1600px, calc(100% - 48px));", "expanded desktop application shell")
require(CSS, ".schedule-panel { padding: 28px; }", "expanded schedule container spacing")
require(CSS, ".people-panel, .receipts-panel { padding: 28px; }", "expanded people container spacing")
require(CSS, ".member-row:hover", "member container feedback")
require(CSS, ".notification-receipt:hover", "receipt container feedback")
require(CSS, ".brand-logo { display: block; width: 100%;", "brand logo viewport crop")
require(CSS, "@keyframes brand-intro-exit", "one-shot brand opening exit")
require(CSS, ".brand-intro { display: none; }", "reduced-motion opening bypass")
require(JS, 'brandIntro?.addEventListener("animationend", dismissBrandIntro', "opening animation cleanup")
require(JS, 'document.body.classList.remove("has-brand-intro")', "opening scroll-lock cleanup")
require(OPENAPI, "/gateway/v1/installations/{installationId}/events:", "custom bot ingress endpoint")
require(OPENAPI, "/gateway/v1/installations/{installationId}/delivery-receipts:", "delivery receipt endpoint")
require(OPENAPI, "botDelivery:", "outbound delivery webhook")
require(OPENAPI, "X-WR-Content-SHA256", "signed body hash")
require(OPENAPI, "additionalProperties: false", "strict object schemas")
require(GATEWAY_DOC, "Personal WeChat / ClawBot", "personal WeChat ClawBot boundary")
require(GATEWAY_DOC, "durable inbox claim", "durable event claim boundary")
require(ROBOT_CONTRACTS, "interface RobotSpeechPort", "provider-neutral robot speech port")
require(ROBOT_CONTRACTS, 'state: "accepted_unverified"', "unverified acceptance state")
require(ROBOT_SERVICE, "#tail: Promise<void>", "serialized robot announcement queue")
require(ROBOT_A3, 'const PLAY_PATH = "/rpc/aimdk.protocol.TTSService/PlayTTS"', "official A3 PlayTTS path")
require(ROBOT_A3, 'priority_level: "INTERACTION_L6"', "official A3 priority field")
require(ROBOT_A3, "is_interrupted: request.interruptCurrent", "official A3 interruption field")
require(ROBOT_A3, "value.tts_status.tts_status", "nested A3 status parsing")
require(ROBOT_A3, "observedActiveStatus", "truthful completion evidence guard")
require(ROBOT_DOC, "v3.2 standard-A3 compatibility is not claimed", "unverified-version boundary")

for required_robot_file in (
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    ".env.example",
    "README.md",
    "src/fake-adapter.ts",
    "scripts/smoke-a3.ts",
    "test/a3-http-adapter.test.ts",
):
    if not (ROBOT_ROOT / required_robot_file).is_file():
        raise AssertionError(f"Missing robot module file: modules/robot/{required_robot_file}")

for forbidden_robot_fragment in ('/rpc/pb:', 'speaker:', 'Record<string, any>'):
    if forbidden_robot_fragment in ROBOT_A3 or forbidden_robot_fragment in ROBOT_CONTRACTS:
        raise AssertionError(f"Forbidden HandOff coupling in robot module: {forbidden_robot_fragment}")

if ROBOT_PACKAGE.get("dependencies"):
    raise AssertionError("Robot module runtime must remain dependency-free")

if "@we-remember/robot-adapter" in HTML or "@we-remember/robot-adapter" in JS:
    raise AssertionError("Static browser prototype must not import the physical robot module")

for removed_fragment in (
    'id="feishu-sign-in"',
    'id="mode-switch"',
    'data-visual-mode="family"',
    "ROLE_ASSETS",
    'id="family-key-input"',
    'id="avatar-step"',
    'id="avatar-upload"',
    'class="brand-mark"',
    "DEMO_FAMILY_KEY",
):
    if removed_fragment in HTML or removed_fragment in JS:
        raise AssertionError(f"Removed identity/workspace direction still present: {removed_fragment}")

if re.search(r'<input\b[^>]*\btype=["\']password["\']', HTML, flags=re.IGNORECASE):
    raise AssertionError("Hackathon username gate must not contain a password input")

if 'username' in JS[JS.index('const requestResponsibilityAnalysis'):JS.index('const appendResponsibilitySuggestion')]:
    raise AssertionError("Username must not enter the Responsibility API request")

for view_name in ("agent", "schedule", "people", "integrations"):
    navigation_items = re.findall(
        rf'<(?:button|a)\b[^>]*\bdata-view=["\']{view_name}["\'][^>]*>',
        HTML,
        flags=re.IGNORECASE,
    )
    if len(navigation_items) < 2:
        raise AssertionError(
            f"Expected desktop and mobile navigation for {view_name}, found {len(navigation_items)}"
        )
    if any(re.search(r'href=["\']\s*#["\']', item, flags=re.IGNORECASE) for item in navigation_items):
        raise AssertionError(f"Primary navigation must not use a placeholder target: {view_name}")

for destination_id in ("agent-view", "schedule-view", "people-view"):
    if len(re.findall(rf'\bid=["\']{destination_id}["\']', HTML)) != 1:
        raise AssertionError(f"Destination id must be unique: {destination_id}")

roles = ("mother", "father", "daughter", "son", "grandfather", "grandmother")
static_states = ("family", "work")
svg_files = sorted(AVATAR_ASSET_ROOT.glob("*/*.svg"))
if len(svg_files) != 12:
    raise AssertionError(f"Expected 12 static avatar SVGs, found {len(svg_files)}")

for role in roles:
    for state in static_states:
        path = AVATAR_ASSET_ROOT / role / f"{state}.svg"
        if not path.is_file():
            raise AssertionError(f"Missing static avatar asset: {path.relative_to(ROOT)}")
        root = ElementTree.parse(path).getroot()
        for element in root.iter():
            tag = element.tag.rsplit("}", 1)[-1]
            if tag in {"script", "image", "foreignObject"}:
                raise AssertionError(f"Unsafe SVG element {tag}: {path.relative_to(ROOT)}")

if any(AVATAR_ASSET_ROOT.glob("*/*-to-*.svg")):
    raise AssertionError("Transition SVGs must not be included in the default avatar library")

brand_animations = {
    "mom-to-we-remember.svg": ("4.8s", "mom", "We Remember", "384", "384", "0 0 384 384"),
    "remomber-to-remember.svg": ("4.6s", "We Remomber", "We Remember", "720", "180", "0 0 720 180"),
}

for file_name, (duration, initial_text, final_text, width, height, view_box) in brand_animations.items():
    path = BRAND_ASSET_ROOT / file_name
    if not path.is_file():
        raise AssertionError(f"Missing brand animation: {path.relative_to(ROOT)}")
    source = path.read_text(encoding="utf-8")
    root = ElementTree.fromstring(source)
    if (
        root.tag.rsplit("}", 1)[-1] != "svg"
        or root.attrib.get("width") != width
        or root.attrib.get("height") != height
        or root.attrib.get("viewBox") != view_box
    ):
        raise AssertionError(f"Invalid brand SVG canvas: {path.relative_to(ROOT)}")
    tags = [element.tag.rsplit("}", 1)[-1] for element in root.iter()]
    if "title" not in tags or "desc" not in tags:
        raise AssertionError(f"Brand SVG needs an accessible title and description: {path.relative_to(ROOT)}")
    if any(tag in {"script", "image", "foreignObject", "filter"} for tag in tags):
        raise AssertionError(f"Brand SVG must remain dependency-free: {path.relative_to(ROOT)}")
    if file_name == "mom-to-we-remember.svg":
        if "text" in tags:
            raise AssertionError("The approved mom wordmark must use fixed paths, not system-font text")
        for color in ("#171813", "#FD6420"):
            require(source, color, f"reference-matched brand color in {file_name}")
    if any(
        element.tag.rsplit("}", 1)[-1] == "rect"
        and element.attrib.get("width") == "720"
        and element.attrib.get("height") == "180"
        for element in root.iter()
    ):
        raise AssertionError(f"Brand SVG must keep a transparent canvas: {path.relative_to(ROOT)}")
    for fragment in (duration, initial_text, final_text, "prefers-reduced-motion: reduce"):
        require(source, fragment, f"brand animation contract in {file_name}")

static_logo_path = BRAND_ASSET_ROOT / "we-remember-logo.svg"
static_logo_source = static_logo_path.read_text(encoding="utf-8")
static_logo_root = ElementTree.fromstring(static_logo_source)
if (
    static_logo_root.attrib.get("width") != "344"
    or static_logo_root.attrib.get("height") != "126"
    or static_logo_root.attrib.get("viewBox") != "20 128 344 126"
):
    raise AssertionError("Invalid static We Remember logo canvas")
static_logo_tags = [element.tag.rsplit("}", 1)[-1] for element in static_logo_root.iter()]
if any(tag in {"style", "script", "image", "foreignObject", "filter", "text"} for tag in static_logo_tags):
    raise AssertionError("Static We Remember logo must remain fixed, path-only, and dependency-free")
for color in ("#171813", "#FD6420"):
    require(static_logo_source, color, "static We Remember logo color")

print("PASS: conversational schedule structural contract")
