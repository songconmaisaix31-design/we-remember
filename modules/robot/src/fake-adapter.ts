import type { RobotSpeechEvidence, RobotSpeechPort, RobotSpeechRequest } from "./contracts.ts";

export class FakeRobotSpeechAdapter implements RobotSpeechPort {
  readonly requests: RobotSpeechRequest[] = [];
  readonly stoppedTraceIds: string[] = [];
  readonly #evidence: RobotSpeechEvidence;

  constructor(evidence: RobotSpeechEvidence = {
    state: "completed",
    providerTraceId: "fake_trace",
    providerStatus: "TTSStatusType_End",
    completionEvidence: "explicit_end",
  }) {
    this.#evidence = evidence;
  }

  speak(request: RobotSpeechRequest): Promise<RobotSpeechEvidence> {
    this.requests.push(structuredClone(request));
    return Promise.resolve(this.#evidence);
  }

  stop(providerTraceId: string): Promise<void> {
    this.stoppedTraceIds.push(providerTraceId);
    return Promise.resolve();
  }
}
