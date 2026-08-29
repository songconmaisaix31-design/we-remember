import {
  RobotAdapterError,
  type RobotDeliveryResult,
  type RobotNotificationIntent,
  type RobotSpeechPort,
} from "./contracts.ts";
import { renderRobotTemplate } from "./templates.ts";

export class RobotNotificationService {
  readonly #speech: RobotSpeechPort;
  #tail: Promise<void> = Promise.resolve();

  constructor(speech: RobotSpeechPort) {
    this.#speech = speech;
  }

  send(intent: RobotNotificationIntent, signal?: AbortSignal): Promise<RobotDeliveryResult> {
    const operation = this.#tail.then(() => this.#sendNow(intent, signal));
    this.#tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async #sendNow(intent: RobotNotificationIntent, signal?: AbortSignal): Promise<RobotDeliveryResult> {
    try {
      validateIntentIdentity(intent);
      const text = renderRobotTemplate(intent);
      const evidence = await this.#speech.speak(
        {
          intentId: intent.intentId,
          text,
          priority: intent.priority,
          interruptCurrent: intent.priority === "urgent",
        },
        signal,
      );

      switch (evidence.state) {
        case "completed":
          return {
            status: "delivered",
            intentId: intent.intentId,
            providerTraceId: evidence.providerTraceId,
            evidence: evidence.completionEvidence,
          };
        case "cancelled":
          return { status: "cancelled", intentId: intent.intentId, providerTraceId: evidence.providerTraceId };
        case "accepted_unverified":
          return { status: "accepted_unverified", intentId: intent.intentId, providerTraceId: evidence.providerTraceId };
        case "timed_out":
          return { status: "timed_out", intentId: intent.intentId, providerTraceId: evidence.providerTraceId };
      }
    } catch (error: unknown) {
      const safeError = error instanceof RobotAdapterError
        ? error
        : new RobotAdapterError("A3_INVALID_RESPONSE", false, { cause: error });
      return {
        status: "failed",
        intentId: intent.intentId,
        code: safeError.code,
        retryable: safeError.retryable,
      };
    }
  }
}

function validateIntentIdentity(intent: RobotNotificationIntent): void {
  const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  if (
    !identifier.test(intent.intentId)
    || !identifier.test(intent.installationId)
    || intent.audience.kind !== "shared_space"
    || !identifier.test(intent.audience.locationId)
  ) {
    throw new RobotAdapterError("INVALID_INTENT", false);
  }
}
