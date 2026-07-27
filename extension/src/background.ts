import browser from "webextension-polyfill";
import {
  EMPTY_SESSION,
  RECORDING_STORAGE_KEY,
  type BugDraftMeta,
  type ExtensionMessage,
  type ExtensionResponse,
  type RecordingSession,
} from "./recording";
import type { Step } from "./types";

async function readSession(): Promise<RecordingSession> {
  const stored = await browser.storage.local.get(RECORDING_STORAGE_KEY);
  return (stored[RECORDING_STORAGE_KEY] as RecordingSession) || EMPTY_SESSION;
}

async function writeSession(session: RecordingSession): Promise<RecordingSession> {
  const next = { ...session, updatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [RECORDING_STORAGE_KEY]: next });
  await updateBadge(next);
  return next;
}

async function updateBadge(session: RecordingSession) {
  const count = session.steps.length;
  if (session.status === "recording" || session.status === "paused") {
    await browser.action.setBadgeText({ text: String(count) });
    await browser.action.setBadgeBackgroundColor({
      color: session.status === "paused" ? "#b45309" : "#0f6e56",
    });
  } else if (session.status === "stopped" && count > 0) {
    await browser.action.setBadgeText({ text: String(count) });
    await browser.action.setBadgeBackgroundColor({ color: "#1a2332" });
  } else {
    await browser.action.setBadgeText({ text: "" });
  }
}

async function injectRecorder(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

async function startRecording(meta: BugDraftMeta, tabId: number) {
  const session: RecordingSession = {
    status: "recording",
    meta,
    steps: [],
    tabId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeSession(session);
  try {
    await injectRecorder(tabId);
    await browser.tabs.sendMessage(tabId, { type: "RECORDING_SYNC", session });
  } catch (err) {
    console.warn("Could not inject recorder into tab", err);
  }
  return session;
}

async function addStep(partial: Omit<Step, "order">) {
  const session = await readSession();
  if (session.status !== "recording") {
    return session;
  }
  const step: Step = { ...partial, order: session.steps.length + 1 };
  return writeSession({ ...session, steps: [...session.steps, step] });
}

browser.runtime.onMessage.addListener((message: unknown) => {
  return handleMessage(message as ExtensionMessage);
});

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  try {
    switch (message.type) {
      case "GET_RECORDING_STATE":
      case "CONTENT_READY":
        return { ok: true, session: await readSession() };
      case "START_RECORDING":
        return {
          ok: true,
          session: await startRecording(message.meta, message.tabId),
        };
      case "PAUSE_RECORDING": {
        const session = await readSession();
        if (session.status !== "recording") return { ok: true, session };
        return { ok: true, session: await writeSession({ ...session, status: "paused" }) };
      }
      case "RESUME_RECORDING": {
        const session = await readSession();
        if (session.status !== "paused") return { ok: true, session };
        return { ok: true, session: await writeSession({ ...session, status: "recording" }) };
      }
      case "STOP_RECORDING": {
        const session = await readSession();
        return { ok: true, session: await writeSession({ ...session, status: "stopped" }) };
      }
      case "CLEAR_RECORDING":
        return { ok: true, session: await writeSession({ ...EMPTY_SESSION }) };
      case "ADD_STEP":
        return { ok: true, session: await addStep(message.step) };
      default:
        return { ok: false, error: "Unknown message" };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Recording error",
    };
  }
}

// Re-inject content script after navigations while recording is active
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const session = await readSession();
  if (
    (session.status === "recording" || session.status === "paused") &&
    session.tabId === tabId
  ) {
    try {
      await injectRecorder(tabId);
      await browser.tabs.sendMessage(tabId, { type: "RECORDING_SYNC", session });
    } catch {
      // page may not allow scripting (chrome:// etc.)
    }
  }
});

void updateBadge(EMPTY_SESSION);
console.log("TestBuddy background ready (recording enabled)");
