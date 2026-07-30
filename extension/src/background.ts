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
import { buildActualStepDescription } from "./stepText";
import { buildObservationFromOverview } from "./content/bugCapture";

let writeChain: Promise<unknown> = Promise.resolve();

async function readSession(): Promise<RecordingSession> {
  const stored = await browser.storage.local.get(RECORDING_STORAGE_KEY);
  const session = (stored[RECORDING_STORAGE_KEY] as RecordingSession) || EMPTY_SESSION;
  return {
    ...EMPTY_SESSION,
    ...session,
    screenshots: session.screenshots || [],
    steps: session.steps || [],
  };
}

async function writeSession(session: RecordingSession): Promise<RecordingSession> {
  const next = { ...session, updatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [RECORDING_STORAGE_KEY]: next });
  await updateBadge(next);
  return next;
}

function enqueueWrite(
  updater: (session: RecordingSession) => RecordingSession | Promise<RecordingSession>,
): Promise<RecordingSession> {
  const run = writeChain.then(async () => {
    const current = await readSession();
    const next = await updater(current);
    return writeSession(next);
  });
  writeChain = run.catch(() => undefined);
  return run;
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
    target: { tabId, allFrames: true },
    files: ["content.js"],
  });
}

async function syncRecorder(tabId: number, session: RecordingSession) {
  await injectRecorder(tabId);
  try {
    await browser.tabs.sendMessage(tabId, { type: "RECORDING_SYNC", session });
  } catch {
    // Frame may not have a listener yet; CONTENT_READY will pull state.
  }
}

function isRestrictedUrl(url: string | undefined) {
  if (!url) return true;
  return /^(chrome|edge|about|devtools|chrome-extension|edge-extension|moz-extension|view-source):/i.test(
    url,
  );
}

async function startRecording(meta: BugDraftMeta, tabId: number) {
  const tab = await browser.tabs.get(tabId);
  if (isRestrictedUrl(tab.url)) {
    throw new Error("Open a normal webpage first — cannot record browser internal pages");
  }

  const session: RecordingSession = {
    status: "recording",
    meta,
    steps: [],
    screenshots: [],
    tabId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeSession(session);
  try {
    await syncRecorder(tabId, session);
  } catch (err) {
    await writeSession({ ...EMPTY_SESSION });
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not inject recorder into this page (${detail}). Reload the page and try again.`,
    );
  }
  return session;
}

async function addStep(partial: Omit<Step, "order">) {
  return enqueueWrite((session) => {
    if (session.status !== "recording" && session.status !== "paused") {
      return session;
    }
    // Bug mode: store actual steps only — never expected-result text.
    const { expectedResult: _ignored, ...actual } = partial;
    const step: Step = { ...actual, order: session.steps.length + 1 };
    return { ...session, steps: [...session.steps, step] };
  });
}

async function addNavigateStep(url: string) {
  return enqueueWrite((session) => {
    if (session.status !== "recording") return session;
    const last = session.steps[session.steps.length - 1];
    if (last?.actionType === "navigate" && last.pageUrl === url) return session;
    const elementLabel = url;
    const step: Step = {
      order: session.steps.length + 1,
      actionType: "navigate",
      elementLabel,
      selector: "",
      pageUrl: url,
      description: buildActualStepDescription({
        actionType: "navigate",
        elementLabel,
      }),
    };
    return { ...session, steps: [...session.steps, step] };
  });
}

async function captureVisibleTab(): Promise<string> {
  const session = await readSession();
  let windowId: number | undefined;
  if (session.tabId != null) {
    try {
      const tab = await browser.tabs.get(session.tabId);
      windowId = tab.windowId;
    } catch {
      // fall through
    }
  }
  if (windowId == null) {
    const current = await browser.windows.getCurrent();
    windowId = current.id;
  }
  if (windowId == null) {
    throw new Error("No browser window available for screenshot");
  }
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, {
    format: "jpeg",
    quality: 70,
  });
  if (!dataUrl) throw new Error("Screenshot capture failed");
  return dataUrl;
}

async function saveBugCapture(args: {
  overview: string;
  dataUrl: string;
  pageUrl: string;
  annotations: { type: "rect"; x: number; y: number; w: number; h: number }[];
}) {
  const id = crypto.randomUUID();
  const overview = args.overview.trim();
  if (!overview) {
    throw new Error("Add a short bug overview before saving");
  }
  if (!args.annotations?.length) {
    throw new Error("Draw a highlight on the screenshot before saving");
  }

  // Keep image smaller for chrome.storage quota
  let dataUrl = args.dataUrl;
  if (dataUrl.length > 900_000) {
    dataUrl = await shrinkDataUrl(dataUrl, 0.55);
  }

  return enqueueWrite(async (session) => {
    if (session.status !== "recording" && session.status !== "paused") {
      throw new Error("Recording is not active — start recording again");
    }
    const shot = {
      id,
      dataUrl,
      overview,
      pageUrl: args.pageUrl,
      createdAt: new Date().toISOString(),
      annotations: args.annotations,
    };
    const step: Step = {
      ...buildObservationFromOverview({
        overview,
        pageUrl: args.pageUrl,
        screenshotId: id,
      }),
      order: session.steps.length + 1,
    };
    return {
      ...session,
      steps: [...session.steps, step],
      screenshots: [...(session.screenshots || []), shot],
    };
  });
}

async function shrinkDataUrl(dataUrl: string, quality: number): Promise<string> {
  // OffscreenCanvas may be unavailable in SW — return original if so.
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(bitmap, 0, 0);
    const out = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const buffer = await out.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch {
    return dataUrl;
  }
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
      case "CAPTURE_VISIBLE_TAB":
        return { ok: true, session: await readSession(), dataUrl: await captureVisibleTab() };
      case "SAVE_BUG_CAPTURE":
        return {
          ok: true,
          session: await saveBugCapture({
            overview: message.overview,
            dataUrl: message.dataUrl,
            pageUrl: message.pageUrl,
            annotations: message.annotations,
          }),
        };
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

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const session = await readSession();
  if (
    !(session.status === "recording" || session.status === "paused") ||
    session.tabId !== tabId
  ) {
    return;
  }

  if (changeInfo.url && session.status === "recording" && !isRestrictedUrl(changeInfo.url)) {
    try {
      await addNavigateStep(changeInfo.url);
    } catch (err) {
      console.warn("Could not record navigate step", err);
    }
  }

  if (changeInfo.status === "complete") {
    try {
      const latest = await readSession();
      await syncRecorder(tabId, latest);
    } catch {
      // page may not allow scripting
    }
  } else if (changeInfo.url && tab.url && !isRestrictedUrl(tab.url)) {
    try {
      const latest = await readSession();
      await syncRecorder(tabId, latest);
    } catch {
      // ignore
    }
  }
});

void updateBadge(EMPTY_SESSION);
console.log("TestBuddy background ready (recording + screenshots)");
