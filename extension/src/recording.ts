import type { BugPriority, BugSeverity, Step } from "./types";
import type { CapturedScreenshot, RectAnnotation } from "./content/bugCapture";

export type { CapturedScreenshot, RectAnnotation };

export type RecordingStatus = "idle" | "recording" | "paused" | "stopped";

export interface BugDraftMeta {
  title: string;
  description: string;
  priority: BugPriority;
  severity: BugSeverity;
  assigneeId: string;
  cycleId: string;
  projectId: string;
}

export interface RecordingSession {
  status: RecordingStatus;
  meta: BugDraftMeta | null;
  steps: Step[];
  screenshots: CapturedScreenshot[];
  tabId: number | null;
  startedAt: string | null;
  updatedAt: string | null;
}

export const EMPTY_SESSION: RecordingSession = {
  status: "idle",
  meta: null,
  steps: [],
  screenshots: [],
  tabId: null,
  startedAt: null,
  updatedAt: null,
};

export const RECORDING_STORAGE_KEY = "recordingSession";

export type ExtensionMessage =
  | { type: "GET_RECORDING_STATE" }
  | { type: "START_RECORDING"; meta: BugDraftMeta; tabId: number }
  | { type: "PAUSE_RECORDING" }
  | { type: "RESUME_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "CLEAR_RECORDING" }
  | { type: "ADD_STEP"; step: Omit<Step, "order"> }
  | { type: "CONTENT_READY" }
  | { type: "CAPTURE_VISIBLE_TAB" }
  | {
      type: "SAVE_BUG_CAPTURE";
      overview: string;
      dataUrl: string;
      pageUrl: string;
      annotations: RectAnnotation[];
    };

export type ExtensionResponse =
  | { ok: true; session: RecordingSession; dataUrl?: string }
  | { ok: false; error: string };
