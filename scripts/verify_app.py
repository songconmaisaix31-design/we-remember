from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "app" / "styles.css").read_text(encoding="utf-8")
JS = (ROOT / "app" / "app.js").read_text(encoding="utf-8")
OPENAPI = (ROOT / "contracts" / "channel-gateway.openapi.yaml").read_text(encoding="utf-8")
GATEWAY_DOC = (ROOT / "docs" / "integration-gateway.md").read_text(encoding="utf-8")
AVATAR_ASSET_ROOT = ROOT / "app" / "assets" / "family-work"


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
require(JS, "window.sessionStorage", "session-only prototype state")
require(JS, 'const DEMO_FAMILY_KEY = "DEMO-HOME"', "public family-key fixture")
require(JS, 'file.size > 2 * 1024 * 1024', "avatar upload size bound")
require(JS, 'new Set(["image/png", "image/jpeg", "image/webp"])', "avatar upload MIME allowlist")
require(CSS, "@media (max-width: 520px)", "mobile breakpoint")
require(CSS, "@media (prefers-reduced-motion: reduce)", "reduced-motion support")
require(CSS, "translateY(-4px)", "reference-inspired card lift")
require(OPENAPI, "/gateway/v1/installations/{installationId}/events:", "custom bot ingress endpoint")
require(OPENAPI, "/gateway/v1/installations/{installationId}/delivery-receipts:", "delivery receipt endpoint")
require(OPENAPI, "botDelivery:", "outbound delivery webhook")
require(OPENAPI, "X-WR-Content-SHA256", "signed body hash")
require(OPENAPI, "additionalProperties: false", "strict object schemas")
require(GATEWAY_DOC, "Personal WeChat / ClawBot", "personal WeChat ClawBot boundary")
require(GATEWAY_DOC, "durable inbox claim", "durable event claim boundary")

for removed_fragment in ('id="feishu-sign-in"', 'id="mode-switch"', 'data-visual-mode="family"', "ROLE_ASSETS"):
    if removed_fragment in HTML or removed_fragment in JS:
        raise AssertionError(f"Removed identity/workspace direction still present: {removed_fragment}")

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
