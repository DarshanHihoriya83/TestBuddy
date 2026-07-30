import browser from "webextension-polyfill";
import type { RecordingSession } from "../recording";
import { buildActualStepDescription, formatBoldHtml } from "../stepText";
import type { Step, StepActionType } from "../types";
import { openAnnotateEditor } from "./annotateOverlay";

const ROOT_ID = "testbuddy-recorder-root";
const STYLE_ID = "testbuddy-recorder-style";
const IS_TOP_FRAME = window === window.top;

declare global {
  interface Window {
    __testbuddyRecorderInstalled?: boolean;
  }
}

if (!window.__testbuddyRecorderInstalled) {
  window.__testbuddyRecorderInstalled = true;
  boot();
}

type CapturedStep = Omit<Step, "order"> & { elementKind?: string };

function boot() {
  let session: RecordingSession | null = null;
  let listenersBound = false;
  let lastFingerprint = "";
  let lastAt = 0;
  let annotating = false;
  let statusBeforeAnnotate: RecordingSession["status"] | null = null;

  const onDomEvent = (event: Event) => {
    if (annotating) return;
    if (!session || session.status !== "recording") return;
    let target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`#${ROOT_ID}`)) return;

    // Form submit: record the form itself
    if (event.type === "submit") {
      const form =
        target instanceof HTMLFormElement
          ? target
          : (target.closest("form") as HTMLFormElement | null);
      if (!form) return;
      const captured = captureFromElement(form, "submit");
      if (!captured) return;
      enqueueStep(captured);
      return;
    }

    // Label click → associated control
    if (target instanceof HTMLLabelElement || target.closest("label")) {
      const labelEl =
        target instanceof HTMLLabelElement ? target : target.closest("label");
      const control = resolveLabelControl(labelEl);
      if (control) target = control;
    }

    const interactive = resolveInteractive(target as Element, event.type);
    if (!interactive) return;

    if (event.type === "click") {
      // Text fields: wait for blur/change so we capture typed data
      if (isTextEntry(interactive)) return;
      // Checkbox/radio: prefer change event (has final checked state)
      if (isToggle(interactive)) return;
      // Select: prefer change
      if (interactive instanceof HTMLSelectElement) return;
    }

    if (event.type === "keydown") {
      const ke = event as KeyboardEvent;
      if (ke.key !== "Enter" || !isTextEntry(interactive)) return;
    }

    if (event.type === "blur" && !isTextEntry(interactive)) return;

    if (event.type === "input" && isTextEntry(interactive)) {
      // Track typing live; step is written on blur / Enter / change
      return;
    }

    const captured = captureFromElement(interactive, event.type);
    if (!captured) return;
    enqueueStep(captured);
  };

  function enqueueStep(captured: CapturedStep) {

    const fingerprint = `${captured.actionType}|${captured.selector}|${captured.valueEntered || ""}|${captured.description}`;
    const now = Date.now();
    if (fingerprint === lastFingerprint && now - lastAt < 400) return;
    lastFingerprint = fingerprint;
    lastAt = now;

    void browser.runtime
      .sendMessage({
        type: "ADD_STEP",
        step: {
          actionType: captured.actionType,
          elementLabel: captured.elementLabel,
          selector: captured.selector,
          valueEntered: captured.valueEntered,
          pageUrl: captured.pageUrl,
          description: captured.description,
        },
      })
      .catch((err) => console.warn("TestBuddy ADD_STEP failed", err));
  }

  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;
    document.addEventListener("click", onDomEvent, true);
    document.addEventListener("change", onDomEvent, true);
    document.addEventListener("blur", onDomEvent, true);
    document.addEventListener("input", onDomEvent, true);
    document.addEventListener("keydown", onDomEvent, true);
    document.addEventListener("submit", onDomEvent, true);
  }

  function unbindListeners() {
    if (!listenersBound) return;
    listenersBound = false;
    document.removeEventListener("click", onDomEvent, true);
    document.removeEventListener("change", onDomEvent, true);
    document.removeEventListener("blur", onDomEvent, true);
    document.removeEventListener("input", onDomEvent, true);
    document.removeEventListener("keydown", onDomEvent, true);
    document.removeEventListener("submit", onDomEvent, true);
  }

  function ensureUi() {
    injectStyles();
    // Remove any stray duplicates in this document
    const existing = document.querySelectorAll(`#${ROOT_ID}`);
    existing.forEach((node, i) => {
      if (i > 0) node.remove();
    });
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function render() {
    // Only the top frame shows the floating toolbar (fixes stacked duplicate panels in iframes).
    // Child frames still bind DOM listeners so steps inside iframes are captured.
    if (!IS_TOP_FRAME) {
      document.getElementById(ROOT_ID)?.remove();
      if (session && (session.status === "recording" || session.status === "paused") && !annotating) {
        bindListeners();
      } else {
        unbindListeners();
      }
      return;
    }

    if (
      annotating ||
      !session ||
      (session.status !== "recording" && session.status !== "paused")
    ) {
      document.getElementById(ROOT_ID)?.remove();
      if (!annotating) unbindListeners();
      return;
    }

    bindListeners();
    const root = ensureUi();
    const latest = [...session.steps].slice(-8).reverse();
    const shotCount = session.screenshots?.length || 0;
    root.innerHTML = `
      <div class="rs-bar">
        <div class="rs-top">
          <div class="rs-brand">
            <span class="rs-dot ${session.status}"></span>
            <strong>TestBuddy</strong>
            <span class="rs-status">${session.status === "paused" ? "Paused" : "Recording"}</span>
          </div>
          <div class="rs-count" title="Recorded steps">
            <span class="rs-count-num">${session.steps.length}</span>
            <span class="rs-count-label">steps</span>
          </div>
        </div>
        <div class="rs-actions rs-actions-3">
          ${
            session.status === "recording"
              ? `<button type="button" data-action="pause">Pause</button>`
              : `<button type="button" data-action="resume">Resume</button>`
          }
          <button type="button" data-action="capture">Screenshot</button>
          <button type="button" class="rs-stop" data-action="stop">Stop</button>
        </div>
        ${
          shotCount
            ? `<div class="rs-shots">${shotCount} screenshot${shotCount === 1 ? "" : "s"} with highlights</div>`
            : ""
        }
        <div class="rs-feed" aria-live="polite">
          ${
            latest.length === 0
              ? `<div class="rs-empty">Interact with the page — or capture a screenshot to mark the bug.</div>`
              : latest
                  .map(
                    (s) => `
            <div class="rs-event">
              <div class="rs-event-head">
                <span class="rs-event-order">Step ${s.order}</span>
                <span class="rs-event-type">${s.actionType}</span>
                ${s.screenshotId ? `<span class="rs-shot-tag">shot</span>` : ""}
                <span class="rs-actual-tag">Actual step</span>
              </div>
              <div class="rs-event-text">${formatBoldHtml(s.description)}</div>
            </div>`,
                  )
                  .join("")
          }
        </div>
      </div>
    `;

    root.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = (btn as HTMLButtonElement).dataset.action;
        if (action === "pause") void send("PAUSE_RECORDING");
        if (action === "resume") void send("RESUME_RECORDING");
        if (action === "stop") void send("STOP_RECORDING");
        if (action === "capture") void startScreenshotCapture();
      });
    });
  }

  async function startScreenshotCapture() {
    if (!IS_TOP_FRAME || annotating || !session) return;
    statusBeforeAnnotate = session.status;
    annotating = true;
    unbindListeners();
    document.getElementById(ROOT_ID)?.remove();

    // Pause so page clicks during annotate aren't recorded
    if (statusBeforeAnnotate === "recording") {
      await send("PAUSE_RECORDING", { skipRender: true });
    }

    try {
      const res = (await browser.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" })) as {
        ok: boolean;
        dataUrl?: string;
        error?: string;
        session?: RecordingSession;
      };
      if (!res?.ok || !res.dataUrl) {
        throw new Error(res?.error || "Could not capture screenshot");
      }

      openAnnotateEditor({
        dataUrl: res.dataUrl,
        onCancel: () => {
          void finishAnnotate(false);
        },
        onSave: (result) => {
          void (async () => {
            try {
              const saveRes = (await browser.runtime.sendMessage({
                type: "SAVE_BUG_CAPTURE",
                overview: result.overview,
                dataUrl: result.dataUrl,
                pageUrl: location.href,
                annotations: result.annotations,
              })) as { ok: boolean; session?: RecordingSession; error?: string };

              if (!saveRes?.ok || !saveRes.session) {
                throw new Error(saveRes?.error || "Could not save screenshot step");
              }
              session = saveRes.session;
              await finishAnnotate(true);
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Save failed";
              console.warn("Save capture failed", err);
              window.alert(`TestBuddy: screenshot step not saved.\n${msg}`);
              await finishAnnotate(false);
            }
          })();
        },
      });
    } catch (err) {
      console.warn("Screenshot capture failed", err);
      const msg = err instanceof Error ? err.message : "Capture failed";
      window.alert(`TestBuddy: could not capture screenshot.\n${msg}`);
      await finishAnnotate(false);
    }
  }

  async function finishAnnotate(saved: boolean) {
    annotating = false;
    const resumeTo = statusBeforeAnnotate;
    statusBeforeAnnotate = null;
    if (resumeTo === "recording") {
      await send("RESUME_RECORDING");
    } else {
      // refresh latest session from storage
      try {
        const res = (await browser.runtime.sendMessage({ type: "GET_RECORDING_STATE" })) as {
          ok?: boolean;
          session?: RecordingSession;
        };
        if (res?.ok && res.session) session = res.session;
      } catch {
        // ignore
      }
      render();
    }
    if (saved && session) {
      // Ensure toolbar shows the new screenshot step immediately
      render();
    }
  }

  async function send(
    type: "PAUSE_RECORDING" | "RESUME_RECORDING" | "STOP_RECORDING",
    opts?: { skipRender?: boolean },
  ) {
    const res = (await browser.runtime.sendMessage({ type })) as {
      ok: boolean;
      session?: RecordingSession;
    };
    if (res?.ok && res.session) {
      session = res.session;
      if (!opts?.skipRender) render();
    }
  }

  browser.runtime.onMessage.addListener((message: unknown) => {
    const msg = message as { type?: string; session?: RecordingSession };
    if (msg?.type === "RECORDING_SYNC" && msg.session) {
      session = msg.session;
      render();
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.recordingSession) return;
    session = (changes.recordingSession.newValue as RecordingSession) || null;
    render();
  });

  void browser.runtime.sendMessage({ type: "CONTENT_READY" }).then((res) => {
    const typed = res as { ok?: boolean; session?: RecordingSession };
    if (typed?.ok && typed.session) {
      session = typed.session;
      render();
    }
  });
}

function captureFromElement(el: Element, eventType: string): CapturedStep | null {
  const kind = detectKind(el);
  const actionType = mapActionType(el, eventType, kind);
  if (!actionType) return null;

  const elementLabel = resolveLabel(el, kind);
  const valueEntered = readDisplayValue(el);
  const description = buildActualStepDescription({
    actionType,
    elementLabel,
    valueEntered,
    elementKind: kind,
  });

  return {
    actionType,
    elementLabel,
    selector: cssPath(el),
    valueEntered,
    pageUrl: location.href,
    description,
    elementKind: kind,
  };
}

function mapActionType(
  _el: Element,
  eventType: string,
  kind: string,
): StepActionType | null {
  if (eventType === "submit" || kind === "form") return "submit";
  if (kind === "select") return "select";
  if (kind === "checkbox" || kind === "radio") return "check";
  if (kind === "input" || kind === "textarea") return "input";
  if (kind === "link" || kind === "button" || kind === "clickable") return "click";
  if (eventType === "click") return "click";
  return null;
}

function detectKind(el: Element): string {
  if (el instanceof HTMLSelectElement) return "select";
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLFormElement) return "form";
  if (el instanceof HTMLAnchorElement || el.getAttribute("role") === "link") return "link";
  if (
    el instanceof HTMLButtonElement ||
    el.getAttribute("role") === "button" ||
    (el instanceof HTMLInputElement &&
      ["button", "submit", "reset", "image"].includes(el.type))
  ) {
    return "button";
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") return "checkbox";
    if (el.type === "radio") return "radio";
    return "input";
  }
  if ((el as HTMLElement).isContentEditable) return "input";
  return "clickable";
}

function isTextEntry(el: Element) {
  if (el instanceof HTMLTextAreaElement) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "image", "file", "hidden"].includes(
      el.type,
    );
  }
  return false;
}

function isToggle(el: Element) {
  return (
    el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
  );
}

function resolveInteractive(el: Element, eventType: string): Element | null {
  const closest = el.closest(
    [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "summary",
      "[role='button']",
      "[role='link']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='tab']",
      "[role='menuitem']",
      "[role='option']",
      "[role='switch']",
      "[contenteditable='true']",
      "[onclick]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(", "),
  );
  if (closest) return closest;

  // Modern SPAs often use div/span click targets without ARIA roles —
  // still record the clicked element so steps aren't silently dropped.
  if (eventType === "click" && el instanceof HTMLElement) {
    const clickable = el.closest("div, span, li, td, th, p, section, article, header, footer, nav, main, aside");
    return clickable || el;
  }

  return null;
}

function resolveLabelControl(label: HTMLLabelElement | null): Element | null {
  if (!label) return null;
  if (label.control) return label.control;
  const nested = label.querySelector("input, select, textarea");
  return nested;
}

function readDisplayValue(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) {
    if (el.type === "password" || isSensitive(el)) return "••••";
    if (el.type === "checkbox") return el.checked ? "checked" : "unchecked";
    if (el.type === "radio") {
      if (!el.checked) return undefined;
      return radioOptionLabel(el) || el.value || "selected";
    }
    return el.value || undefined;
  }
  if (el instanceof HTMLTextAreaElement) {
    if (isSensitive(el)) return "••••";
    return el.value || undefined;
  }
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    return (opt?.textContent || el.value || "").trim() || undefined;
  }
  if ((el as HTMLElement).isContentEditable) {
    return ((el as HTMLElement).innerText || "").trim() || undefined;
  }
  if (el instanceof HTMLAnchorElement) {
    return el.href || undefined;
  }
  return undefined;
}

function radioOptionLabel(el: HTMLInputElement): string | undefined {
  if (el.id) {
    const label = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
    const text = labelTextWithoutControl(label, el);
    if (text) return text;
  }
  const wrapping = el.closest("label");
  const wrapped = labelTextWithoutControl(wrapping, el);
  if (wrapped) return wrapped;
  const sibling = nearbyText(el);
  return sibling || undefined;
}

function isSensitive(el: Element) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && el.type === "password") return true;
  const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
  if (
    autocomplete.includes("password") ||
    autocomplete.includes("cc-") ||
    autocomplete.includes("one-time")
  ) {
    return true;
  }
  const name = `${el.name} ${el.id} ${el.className}`.toLowerCase();
  return /password|passwd|secret|ssn|credit|card.?number/.test(name);
}

function resolveLabel(el: Element, kind?: string): string {
  if (el instanceof HTMLElement) {
    const aria = el.getAttribute("aria-label")?.trim();
    if (aria) return cleanText(aria);
  }

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    // Explicit label for this control
    if (el.id) {
      const label = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      const text = labelTextWithoutControl(label, el);
      if (text && kind !== "radio") return text;
      // For radio, personal label is the option text — group label comes from fieldset/name
      if (text && kind === "checkbox") return text;
    }
    const wrapping = el.closest("label");
    const wrapped = labelTextWithoutControl(wrapping, el);
    if (wrapped && kind === "checkbox") return wrapped;
    if (wrapped && kind !== "radio") return wrapped;

    if (kind === "radio") {
      const fieldset = el.closest("fieldset");
      const legend = fieldset?.querySelector("legend");
      if (legend?.textContent?.trim()) return cleanText(legend.textContent);
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const ref = document.getElementById(labelledBy);
        if (ref?.textContent?.trim()) return cleanText(ref.textContent);
      }
      if (el instanceof HTMLInputElement && el.name) {
        return cleanText(el.name.replace(/[_-]+/g, " "));
      }
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.placeholder?.trim()) return cleanText(el.placeholder);
      const title = el.getAttribute("title")?.trim();
      if (title) return cleanText(title);
    }
    if (el.name) return cleanText(el.name.replace(/[_-]+/g, " "));
  }

  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
    const v = (el as HTMLInputElement).value?.trim();
    if (v && ["button", "submit", "reset"].includes((el as HTMLInputElement).type || "button")) {
      return cleanText(v);
    }
  }

  if (el instanceof HTMLAnchorElement) {
    const text = cleanText(el.innerText || el.textContent || "");
    if (text) return text;
    return el.href || "link";
  }

  if (el instanceof HTMLFormElement) {
    const name = el.getAttribute("name")?.trim() || el.getAttribute("aria-label")?.trim();
    if (name) return cleanText(name);
    if (el.id) return cleanText(el.id.replace(/[_-]+/g, " "));
    return "form";
  }

  if (el instanceof HTMLElement) {
    const text = cleanText(el.innerText || el.textContent || "");
    if (text) return text.slice(0, 80);
  }

  return el.tagName.toLowerCase();
}

function labelTextWithoutControl(label: Element | null, _control: Element): string | null {
  if (!label) return null;
  const clone = label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input, select, textarea, button").forEach((n) => n.remove());
  const text = cleanText(clone.textContent || "");
  if (text) return text.slice(0, 80);
  return null;
}

function nearbyText(el: Element): string | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const text = cleanText(parent.innerText || parent.textContent || "");
  return text ? text.slice(0, 80) : null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cssPath(el: Element): string {
  if (el.id) return `#${cssEscape(el.id)}`;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && parts.length < 4) {
    let part = node.tagName.toLowerCase();
    if (node.classList.length) {
      part += "." + Array.from(node.classList).slice(0, 2).map(cssEscape).join(".");
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      all: initial;
      position: fixed;
      z-index: 2147483646;
      right: 16px;
      bottom: 16px;
      width: 340px;
      font-family: "Segoe UI", "IBM Plex Sans", sans-serif;
      color: #1a2332;
    }
    #${ROOT_ID} * { box-sizing: border-box; font-family: inherit; }
    #${ROOT_ID} .rs-bar {
      background: rgba(255,255,255,0.97);
      border: 1px solid #d7dee7;
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(26,35,50,0.18);
      padding: 12px;
      backdrop-filter: blur(8px);
    }
    #${ROOT_ID} .rs-top {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    #${ROOT_ID} .rs-brand {
      display: flex; align-items: center; gap: 8px; font-size: 13px;
    }
    #${ROOT_ID} .rs-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #0f6e56;
      box-shadow: 0 0 0 4px rgba(15,110,86,0.15);
    }
    #${ROOT_ID} .rs-dot.paused { background: #b45309; box-shadow: 0 0 0 4px rgba(180,83,9,0.15); }
    #${ROOT_ID} .rs-status { color: #5c6b7a; font-size: 12px; }
    #${ROOT_ID} .rs-count { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1; }
    #${ROOT_ID} .rs-count-num { font-size: 22px; font-weight: 700; color: #0f6e56; letter-spacing: -0.03em; }
    #${ROOT_ID} .rs-count-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #5c6b7a; }
    #${ROOT_ID} .rs-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    #${ROOT_ID} .rs-actions-3 { grid-template-columns: 1fr 1fr 1fr; }
    #${ROOT_ID} button {
      border: 1px solid #d7dee7; background: #fff; border-radius: 10px;
      padding: 8px 6px; font-size: 11px; font-weight: 600; cursor: pointer; color: #1a2332;
    }
    #${ROOT_ID} button.rs-stop { background: #0f6e56; border-color: #0f6e56; color: #fff; }
    #${ROOT_ID} .rs-shots {
      margin-top: 8px; font-size: 11px; color: #0f6e56; font-weight: 600;
    }
    #${ROOT_ID} .rs-feed {
      margin-top: 10px; max-height: 220px; overflow: auto;
      display: flex; flex-direction: column; gap: 6px;
    }
    #${ROOT_ID} .rs-empty {
      font-size: 12px; color: #5c6b7a; padding: 8px; background: #f3f6f9; border-radius: 8px;
    }
    #${ROOT_ID} .rs-event {
      font-size: 11px; padding: 8px; border-radius: 8px; background: #e6f4ef;
      animation: rs-pop 180ms ease-out;
    }
    #${ROOT_ID} .rs-event-head {
      display: flex; gap: 6px; align-items: center; margin-bottom: 4px; flex-wrap: wrap;
    }
    #${ROOT_ID} .rs-event-order { font-weight: 700; color: #0f6e56; }
    #${ROOT_ID} .rs-event-type {
      text-transform: uppercase; letter-spacing: 0.04em; color: #5c6b7a; font-size: 10px;
    }
    #${ROOT_ID} .rs-shot-tag {
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
      background: #ffe4e6; color: #be123c; padding: 2px 6px; border-radius: 999px; font-weight: 700;
    }
    #${ROOT_ID} .rs-actual-tag {
      margin-left: auto; font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; color: #0f6e56; background: #fff; border: 1px solid #c5ddd3;
      padding: 2px 6px; border-radius: 999px; white-space: nowrap;
    }
    #${ROOT_ID} .rs-event-text { color: #1a2332; line-height: 1.35; }
    #${ROOT_ID} .rs-event-text strong { font-weight: 700; color: #0b4f3d; }
    #${ROOT_ID} .rs-expected {
      margin-top: 4px; padding-top: 4px; border-top: 1px dashed #b7d7cb;
      color: #3d4f5f; font-size: 10.5px; line-height: 1.35;
    }
    #${ROOT_ID} .rs-expected span { font-weight: 700; color: #5c6b7a; margin-right: 4px; }
    #${ROOT_ID} .rs-expected strong { font-weight: 700; color: #0b4f3d; }
    @keyframes rs-pop {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    #testbuddy-annotate-overlay {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(15, 23, 32, 0.72);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: "Segoe UI", "IBM Plex Sans", sans-serif;
      color: #1a2332;
      pointer-events: auto;
    }
    #testbuddy-annotate-overlay * { box-sizing: border-box; font-family: inherit; }
    #testbuddy-annotate-overlay .tb-ann-panel {
      width: min(980px, 100%);
      background: #fff;
      border-radius: 16px;
      padding: 14px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.35);
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: calc(100vh - 32px);
      pointer-events: auto;
    }
    #testbuddy-annotate-overlay .tb-ann-head {
      display: flex; flex-direction: column; gap: 2px;
    }
    #testbuddy-annotate-overlay .tb-ann-head strong { font-size: 16px; }
    #testbuddy-annotate-overlay .tb-ann-head span { font-size: 12px; color: #5c6b7a; }
    #testbuddy-annotate-overlay .tb-ann-stage {
      overflow: auto; background: #0f1720; border-radius: 12px;
      display: flex; justify-content: center; align-items: center; padding: 8px;
      pointer-events: auto;
    }
    #testbuddy-annotate-overlay .tb-ann-canvas {
      cursor: crosshair;
      max-width: 100%;
      border-radius: 4px;
      touch-action: none;
      pointer-events: auto !important;
      user-select: none;
      display: block;
    }
    #testbuddy-annotate-overlay .tb-ann-status {
      min-height: 18px;
      font-size: 12px;
      font-weight: 600;
      color: #5c6b7a;
    }
    #testbuddy-annotate-overlay .tb-ann-status[data-kind="ok"] { color: #0f6e56; }
    #testbuddy-annotate-overlay .tb-ann-status[data-kind="error"] { color: #be123c; }
    #testbuddy-annotate-overlay .tb-ann-label {
      display: flex; flex-direction: column; gap: 6px;
      font-size: 12px; font-weight: 600; color: #3d4f5f;
    }
    #testbuddy-annotate-overlay .tb-ann-overview {
      width: 100%; resize: vertical; min-height: 56px;
      border: 1px solid #d7dee7; border-radius: 10px; padding: 10px;
      font-size: 13px; font-weight: 400; color: #1a2332;
      pointer-events: auto;
    }
    #testbuddy-annotate-overlay .tb-ann-actions {
      display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;
    }
    #testbuddy-annotate-overlay .tb-ann-actions button {
      border: 1px solid #d7dee7; background: #fff; border-radius: 10px;
      padding: 9px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
      pointer-events: auto;
    }
    #testbuddy-annotate-overlay .tb-ann-primary {
      background: #0f6e56 !important; border-color: #0f6e56 !important; color: #fff !important;
    }
    #testbuddy-annotate-overlay .tb-ann-hint {
      font-size: 11px; color: #5c6b7a;
    }
  `;
  document.documentElement.appendChild(style);
}
