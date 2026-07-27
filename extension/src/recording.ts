import type { BugPriority, BugSeverity, Step } from "./types";

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
  tabId: number | null;
  startedAt: string | null;
  updatedAt: string | null;
}

export const EMPTY_SESSION: RecordingSession = {
  status: "idle",
  meta: null,
  steps: [],
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
  | { type: "CONTENT_READY" };

export type ExtensionResponse =
  | { ok: true; session: RecordingSession }
  | { ok: false; error: string };
