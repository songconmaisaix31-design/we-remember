import { RobotAdapterError, type RobotSpeechPort } from "./contracts.ts";
import { A3HttpSpeechAdapter, type A3HttpSpeechAdapterDependencies } from "./a3-http-adapter.ts";

export type A3RuntimeConfig =
  | { enabled: false }
  | { enabled: true; baseUrl: string; domain: string };

export function parseA3RuntimeConfig(environment: Readonly<Record<string, string | undefined>>): A3RuntimeConfig {
  const enabledValue = environment.ROBOT_A3_ENABLED?.trim().toLowerCase() ?? "false";
  if (enabledValue !== "true" && enabledValue !== "false") {
    throw new RobotAdapterError("INVALID_CONFIGURATION", false);
  }
  if (enabledValue === "false") return { enabled: false };

  const baseUrl = environment.ROBOT_A3_BASE_URL?.trim();
  const domain = environment.ROBOT_A3_DOMAIN?.trim() || "we-remember";
  if (!baseUrl) {
    throw new RobotAdapterError("INVALID_CONFIGURATION", false);
  }
  return { enabled: true, baseUrl, domain };
}

export function createA3SpeechPort(
  config: A3RuntimeConfig,
  dependencies: A3HttpSpeechAdapterDependencies = {},
): RobotSpeechPort {
  if (!config.enabled) return new DisabledRobotSpeechAdapter();
  return new A3HttpSpeechAdapter({ baseUrl: config.baseUrl, domain: config.domain }, dependencies);
}

class DisabledRobotSpeechAdapter implements RobotSpeechPort {
  speak(): Promise<never> {
    return Promise.reject(new RobotAdapterError("ROBOT_DISABLED", false));
  }

  stop(): Promise<never> {
    return Promise.reject(new RobotAdapterError("ROBOT_DISABLED", false));
  }
}
