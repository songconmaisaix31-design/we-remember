from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "app" / "styles.css").read_text(encoding="utf-8")
JS = (ROOT / "app" / "app.js").read_text(encoding="utf-8")
OPENAPI = (ROOT / "contracts" / "channel-gateway.openapi.yaml").read_text(encoding="utf-8")
GATEWAY_DOC = (ROOT / "docs" / "integration-gateway.md").read_text(encoding="utf-8")


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
require(HTML, 'data-channel="wecom"', "WeCom connector")
require(HTML, 'data-channel="wechat-clawbot"', "personal WeChat ClawBot connector")
require(HTML, 'data-channel="feishu"', "Feishu connector")
require(HTML, 'data-channel="dingtalk"', "DingTalk connector")
require(HTML, 'data-channel="custom-bot"', "custom bot connector")
require(JS, "window.SpeechRecognition || window.webkitSpeechRecognition", "speech capability detection")
require(JS, 'mode === "voice_message"', "voice auto-send branch")
require(JS, 'dataset.confirmed = "true"', "confirmation gate")
require(JS, "appendTimelineEvent(draft)", "confirmed schedule sync")
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

print("PASS: conversational schedule structural contract")
