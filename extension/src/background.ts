import browser from "webextension-polyfill";
import { createBug, getToken } from "./api";
import { detectEnvironmentSnapshot, hostnameFromUrl } from "./environmentSnapshot";
import {
  EMPTY_SESSION,
  RECORDING_STORAGE_KEY,
  type BugDraftMeta,
  type ExtensionMessage,
  type ExtensionResponse,
  type RecordingSession,
} from "./recording";
import type { Step } from "./types";
import { buildActualResult, buildStepAction } from "./stepText";
import {
  buildObservationFromOverview,
  composeBugDescription,
  type Annotation,
} from "./content/bugCapture";
import { compressDataUrlForStorage } from "./utils/imageCompress";

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
    // Keep expectedResult only when explicitly set (defect/screenshot step).
    const expected = partial.expectedResult?.trim() || undefined;
    const step: Step = {
      ...partial,
      expectedResult: expected,
      order: session.steps.length + 1,
    };
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
      description: buildStepAction({
        actionType: "navigate",
        elementLabel,
      }),
      actualResult: buildActualResult({
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
  // PNG = full fidelity of the visible tab (sharp text). Compress later on save.
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, {
    format: "png",
  });
  if (!dataUrl) throw new Error("Screenshot capture failed");
  return dataUrl;
}

async function saveBugCapture(args: {
  overview: string;
  dataUrl: string;
  pageUrl: string;
  annotations: Annotation[];
}) {
  const id = crypto.randomUUID();
  const overview = args.overview.trim();
  if (!overview) {
    throw new Error("Add a short bug overview before saving");
  }
  if (!args.annotations?.length) {
    throw new Error("Draw a highlight on the screenshot before saving");
  }

  // Already sharp-encoded in annotate editor; light storage pass if still huge
  let dataUrl = args.dataUrl;
  if (dataUrl.length > 1_200_000) {
    dataUrl = await compressDataUrlForStorage(dataUrl);
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

async function uploadBugFromSession(): Promise<{
  session: RecordingSession;
  bugId: string;
  message: string;
}> {
  const token = await getToken();
  if (!token) throw new Error("Not signed in — open the extension popup and sign in as Tester");

  let session = await readSession();
  if (!session.meta) throw new Error("No bug draft — start recording from the popup first");
  if (!session.meta.moduleId) {
    throw new Error("Select a module in the popup before starting, then use Upload bug");
  }
  if (!session.steps.length) {
    throw new Error("No steps captured yet — interact with the page or take a screenshot");
  }

  const meta = session.meta;
  const environmentSnapshot =
    meta.environmentSnapshot ||
    detectEnvironmentSnapshot(
      hostnameFromUrl(session.steps.at(-1)?.pageUrl ?? session.screenshots?.at(-1)?.pageUrl),
    );

  // Stop recording if still live so upload is consistent
  if (session.status === "recording" || session.status === "paused") {
    session = await writeSession({ ...session, status: "stopped", meta });
  }

  const bug = await createBug({
    title: meta.title,
    description: composeBugDescription(meta.description, session.screenshots || []),
    priority: meta.priority,
    severity: meta.severity,
    assigneeId: meta.assigneeId,
    sprintId: meta.sprintId,
    projectId: meta.projectId,
    moduleId: meta.moduleId,
    environmentId: meta.environmentId,
    environmentSnapshot,
    status: "NEW",
    steps: session.steps.map((step) => ({
      order: step.order,
      actionType: step.actionType,
      elementLabel: step.elementLabel,
      selector: step.selector,
      valueEntered: step.valueEntered,
      pageUrl: step.pageUrl,
      description: step.description,
      actualResult: step.actualResult,
      expectedResult: step.expectedResult?.trim() ? step.expectedResult : undefined,
      screenshotId: step.screenshotId,
    })),
    screenshots: (session.screenshots || []).map((shot) => ({
      id: shot.id,
      dataUrl: shot.dataUrl,
      overview: shot.overview,
      pageUrl: shot.pageUrl,
      createdAt: shot.createdAt,
      annotations: shot.annotations,
    })),
  });

  const cleared = await writeSession({ ...EMPTY_SESSION });
  const moduleLabel = meta.moduleName || "selected module";
  return {
    session: cleared,
    bugId: bug.id,
    message: `Bug uploaded to ${moduleLabel} (${bug.steps.length} steps)`,
  };
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
      case "PATCH_STEP_TEXTS": {
        const session = await readSession();
        const patches = message.steps;
        if (!patches.length) return { ok: true, session };
        const byOrder = new Map(patches.map((p) => [p.order, p]));
        const steps = session.steps.map((step) => {
          const p = byOrder.get(step.order);
          if (!p) return step;
          return {
            ...step,
            description: typeof p.description === "string" ? p.description : step.description,
            actualResult:
              typeof p.actualResult === "string" ? p.actualResult : step.actualResult,
            expectedResult:
              typeof p.expectedResult === "string"
                ? p.expectedResult.trim() || undefined
                : step.expectedResult,
          };
        });
        return { ok: true, session: await writeSession({ ...session, steps }) };
      }
      case "CLEAR_RECORDING":
        return { ok: true, session: await writeSession({ ...EMPTY_SESSION }) };
      case "PATCH_RECORDING_META": {
        const session = await readSession();
        if (!session.meta) return { ok: true, session };
        const nextMeta = { ...session.meta, ...message.meta };
        return {
          ok: true,
          session: await writeSession({ ...session, meta: nextMeta }),
        };
      }
      case "UPLOAD_BUG": {
        const result = await uploadBugFromSession();
        return {
          ok: true,
          session: result.session,
          bugId: result.bugId,
          message: result.message,
        };
      }
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
