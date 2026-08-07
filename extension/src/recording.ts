import type { BugPriority, BugSeverity, Step } from "./types";
import type { Annotation, CapturedScreenshot, RectAnnotation } from "./content/bugCapture";

export type { Annotation, CapturedScreenshot, RectAnnotation };

export type RecordingStatus = "idle" | "recording" | "paused" | "stopped";

export interface BugDraftMeta {
  title: string;
  description: string;
  priority: BugPriority;
  severity: BugSeverity;
  assigneeId: string;
  sprintId: string;
  projectId: string;
  moduleId?: string;
  environmentId?: string;
  environmentSnapshot?: string;
  /** Display name for on-page toolbar */
  moduleName?: string;
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
  | { type: "PATCH_RECORDING_META"; meta: Partial<BugDraftMeta> }
  | { type: "UPLOAD_BUG" }
  | {
      type: "PATCH_STEP_TEXTS";
      steps: Array<{
        order: number;
        description?: string;
        actualResult?: string;
        expectedResult?: string;
      }>;
    }
  | { type: "ADD_STEP"; step: Omit<Step, "order"> }
  | { type: "CONTENT_READY" }
  | { type: "CAPTURE_VISIBLE_TAB" }
  | {
      type: "SAVE_BUG_CAPTURE";
      overview: string;
      dataUrl: string;
      pageUrl: string;
      annotations: Annotation[];
    };

export type ExtensionResponse =
  | { ok: true; session: RecordingSession; dataUrl?: string; bugId?: string; message?: string }
  | { ok: false; error: string };
