export type RobotPriority = "normal" | "high" | "urgent";

export type RobotTemplateInput =
  | {
      template: "care_reminder";
      data: { subjectName?: string; title: string; instruction: string };
    }
  | {
      template: "escalation";
      data: { subjectName: string; title: string };
    }
  | {
      template: "handover_confirm";
      data: { domainName: string };
    };

export type RobotNotificationIntent = RobotTemplateInput & {
  intentId: string;
  installationId: string;
  audience: { kind: "shared_space"; locationId: string };
  priority: RobotPriority;
};

export interface RobotSpeechRequest {
  intentId: string;
  text: string;
  priority: RobotPriority;
  interruptCurrent: boolean;
}

export type RobotSpeechEvidence =
  | {
      state: "completed";
      providerTraceId: string;
      providerStatus: "TTSStatusType_End" | "TTSStatusType_NOTInQue";
      completionEvidence: "explicit_end" | "queue_absent_after_accept";
    }
  | {
      state: "accepted_unverified";
      providerTraceId: string;
      providerStatus: "TTSStatusType_NOTInQue";
    }
  | {
      state: "cancelled";
      providerTraceId: string;
      providerStatus: "TTSStatusType_Stop";
    }
  | {
      state: "timed_out";
      providerTraceId: string;
      lastProviderStatus: string;
    };

export interface RobotSpeechPort {
  speak(request: RobotSpeechRequest, signal?: AbortSignal): Promise<RobotSpeechEvidence>;
  stop(providerTraceId: string, signal?: AbortSignal): Promise<void>;
}

export type RobotDeliveryResult =
  | {
      status: "delivered";
      intentId: string;
      providerTraceId: string;
      evidence: "explicit_end" | "queue_absent_after_accept";
    }
  | {
      status: "accepted_unverified";
      intentId: string;
      providerTraceId: string;
    }
  | {
      status: "cancelled" | "timed_out";
      intentId: string;
      providerTraceId: string;
    }
  | {
      status: "failed";
      intentId: string;
      code: RobotAdapterErrorCode;
      retryable: boolean;
    };

export type RobotAdapterErrorCode =
  | "ROBOT_DISABLED"
  | "INVALID_CONFIGURATION"
  | "INVALID_INTENT"
  | "TTS_TEXT_TOO_LONG"
  | "A3_HTTP_ERROR"
  | "A3_INVALID_RESPONSE"
  | "A3_REJECTED"
  | "A3_PLAYBACK_ERROR"
  | "A3_REQUEST_ABORTED";

export class RobotAdapterError extends Error {
  readonly code: RobotAdapterErrorCode;
  readonly retryable: boolean;

  constructor(code: RobotAdapterErrorCode, retryable: boolean, options?: ErrorOptions) {
    super(code, options);
    this.name = "RobotAdapterError";
    this.code = code;
    this.retryable = retryable;
  }
}
