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
require(HTML, 'id="auth-gate"', "signed-out gate")
require(HTML, 'id="family-key-input"', "family-key input")
require(HTML, 'id="matched-family"', "unique family confirmation")
require(HTML, 'id="avatar-step"', "custom avatar selection")
require(HTML, 'id="avatar-upload"', "local avatar upload")
require(HTML, 'aria-label="默认 SVG 头像"', "static SVG avatar library")
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
require(JS, "window.sessionStorage", "session-only prototype state")
require(JS, 'const DEMO_FAMILY_KEY = "DEMO-HOME"', "public family-key fixture")
require(JS, 'file.size > 2 * 1024 * 1024', "avatar upload size bound")
require(JS, 'new Set(["image/png", "image/jpeg", "image/webp"])', "avatar upload MIME allowlist")
require(CSS, "@media (max-width: 520px)", "mobile breakpoint")
require(CSS, "@media (prefers-reduced-motion: reduce)", "reduced-motion support")
require(CSS, "translateY(-4px)", "reference-inspired card lift")
require(CSS, ".schedule-panel, .people-panel, .receipts-panel { border-radius: 28px; }", "rounded primary detail containers")
require(CSS, ".member-row:hover", "member container feedback")
require(CSS, ".notification-receipt:hover", "receipt container feedback")
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

for removed_fragment in ('id="feishu-sign-in"', 'id="mode-switch"', 'data-visual-mode="family"', "ROLE_ASSETS"):
    if removed_fragment in HTML or removed_fragment in JS:
        raise AssertionError(f"Removed identity/workspace direction still present: {removed_fragment}")

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

print("PASS: conversational schedule structural contract")
