import { RobotAdapterError, type RobotTemplateInput } from "./contracts.ts";

const MAX_TTS_BYTES = 1024;
const MAX_FIELD_CHARACTERS = 300;

function normalizeField(value: unknown): string {
  if (typeof value !== "string") {
    throw new RobotAdapterError("INVALID_INTENT", false);
  }

  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length === 0 || normalized.length > MAX_FIELD_CHARACTERS) {
    throw new RobotAdapterError("INVALID_INTENT", false);
  }

  return normalized;
}

export function renderRobotTemplate(input: RobotTemplateInput): string {
  let text: string;

  switch (input.template) {
    case "care_reminder": {
      const subject = input.data.subjectName ? `${normalizeField(input.data.subjectName)}，` : "";
      text = `${subject}${normalizeField(input.data.title)}时间到了，${normalizeField(input.data.instruction)}`;
      break;
    }
    case "escalation":
      text = `紧急提醒：${normalizeField(input.data.subjectName)}的${normalizeField(input.data.title)}尚未处理，请尽快查看`;
      break;
    case "handover_confirm":
      text = `责任域交接已确认：${normalizeField(input.data.domainName)}`;
      break;
  }

  if (new TextEncoder().encode(text).byteLength > MAX_TTS_BYTES) {
    throw new RobotAdapterError("TTS_TEXT_TOO_LONG", false);
  }

  return text;
}
