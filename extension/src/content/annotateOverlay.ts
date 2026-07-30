import type { RectAnnotation } from "./bugCapture";

const OVERLAY_ID = "testbuddy-annotate-overlay";

export type AnnotateResult = {
  dataUrl: string;
  overview: string;
  annotations: RectAnnotation[];
};

/**
 * Full-page screenshot annotator: draw a highlight rectangle + bug overview.
 */
export function openAnnotateEditor(args: {
  dataUrl: string;
  onSave: (result: AnnotateResult) => void;
  onCancel: () => void;
}): void {
  document.getElementById(OVERLAY_ID)?.remove();

  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.innerHTML = `
    <div class="tb-ann-panel" role="dialog" aria-modal="true">
      <div class="tb-ann-head">
        <strong>Mark the bug</strong>
        <span>Drag on the image to highlight, add a short overview, then save</span>
      </div>
      <div class="tb-ann-stage">
        <canvas class="tb-ann-canvas"></canvas>
      </div>
      <div class="tb-ann-status" aria-live="polite"></div>
      <label class="tb-ann-label">
        Bug overview
        <textarea class="tb-ann-overview" rows="2" maxlength="400"
          placeholder="e.g. Accordion Section 1 does not expand after click"></textarea>
      </label>
      <div class="tb-ann-actions">
        <button type="button" data-act="clear">Clear box</button>
        <button type="button" data-act="cancel">Cancel</button>
        <button type="button" class="tb-ann-primary" data-act="save">Generate step &amp; save</button>
      </div>
      <div class="tb-ann-hint">Tip: click-drag on the screenshot to draw a red highlight box.</div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const panel = root.querySelector(".tb-ann-panel") as HTMLElement;
  const canvas = root.querySelector(".tb-ann-canvas") as HTMLCanvasElement;
  const overviewEl = root.querySelector(".tb-ann-overview") as HTMLTextAreaElement;
  const statusEl = root.querySelector(".tb-ann-status") as HTMLElement;
  const ctxOrNull = canvas.getContext("2d");
  if (!ctxOrNull) {
    root.remove();
    args.onCancel();
    return;
  }
  const ctx = ctxOrNull;

  const img = new Image();
  let rect: RectAnnotation | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let drawing = false;

  function setStatus(text: string, kind: "info" | "error" | "ok" = "info") {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  }

  img.onload = () => {
    const maxW = Math.min(window.innerWidth - 48, 960);
    const maxH = Math.min(window.innerHeight - 240, 640);
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    // CSS size must match bitmap for correct pointer mapping
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    redraw();
    setStatus("Draw a box on the bug area, then write an overview.", "info");
  };
  img.onerror = () => {
    setStatus("Could not load screenshot image.", "error");
  };
  img.src = args.dataUrl;

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    if (rect && rect.w > 1 && rect.h > 1) {
      ctx.save();
      ctx.lineWidth = Math.max(3, Math.round(canvas.width / 400));
      ctx.strokeStyle = "#e11d48";
      ctx.fillStyle = "rgba(225, 29, 72, 0.22)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w, rect.h);
      // corner handles for visibility
      const hs = 6;
      ctx.fillStyle = "#e11d48";
      for (const [hx, hy] of [
        [rect.x, rect.y],
        [rect.x + rect.w, rect.y],
        [rect.x, rect.y + rect.h],
        [rect.x + rect.w, rect.y + rect.h],
      ] as const) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
      ctx.restore();
    }
  }

  function canvasPoint(clientX: number, clientY: number) {
    const box = canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / Math.max(box.width, 1)) * canvas.width;
    const y = ((clientY - box.top) / Math.max(box.height, 1)) * canvas.height;
    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };
  }

  function onDown(clientX: number, clientY: number, pointerId?: number) {
    drawing = true;
    dragStart = canvasPoint(clientX, clientY);
    rect = { type: "rect", x: dragStart.x, y: dragStart.y, w: 0, h: 0 };
    if (pointerId != null) {
      try {
        canvas.setPointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
    setStatus("Dragging highlight…", "info");
  }

  function onMove(clientX: number, clientY: number) {
    if (!drawing || !dragStart) return;
    const p = canvasPoint(clientX, clientY);
    rect = {
      type: "rect",
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      w: Math.abs(p.x - dragStart.x),
      h: Math.abs(p.y - dragStart.y),
    };
    redraw();
  }

  function onUp() {
    if (!drawing) return;
    drawing = false;
    dragStart = null;
    if (rect && rect.w >= 4 && rect.h >= 4) {
      setStatus(
        `Highlight ready (${Math.round(rect.w)}×${Math.round(rect.h)}). Add overview and save.`,
        "ok",
      );
    } else {
      rect = null;
      redraw();
      setStatus("Highlight too small — drag a larger box.", "error");
    }
  }

  // Prefer pointer events; also bind mouse as fallback (some pages break pointer)
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDown(e.clientX, e.clientY, e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    e.stopPropagation();
    onMove(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointerup", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onUp();
  });
  canvas.addEventListener("pointercancel", () => onUp());

  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDown(e.clientX, e.clientY);
  });
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);

  function onWindowMouseMove(e: MouseEvent) {
    if (!drawing) return;
    onMove(e.clientX, e.clientY);
  }
  function onWindowMouseUp() {
    if (!drawing) return;
    onUp();
  }

  // Block page handlers without killing events inside the panel (bubble only).
  const stopBubble = (e: Event) => e.stopPropagation();
  for (const type of ["click", "mousedown", "mouseup", "mousemove", "pointerdown", "keydown", "keyup"]) {
    root.addEventListener(type, stopBubble, false);
  }

  // Clicks on dark backdrop cancel? No — ignore. Only cancel button.
  root.addEventListener("mousedown", (e) => {
    if (e.target === root) e.preventDefault();
  });

  panel.addEventListener("mousedown", (e) => e.stopPropagation());

  root.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const act = (btn as HTMLButtonElement).dataset.act;
      if (act === "clear") {
        rect = null;
        redraw();
        setStatus("Highlight cleared — draw again.", "info");
      } else if (act === "cancel") {
        cleanup();
        args.onCancel();
      } else if (act === "save") {
        const overview = overviewEl.value.trim();
        if (!overview) {
          overviewEl.focus();
          setStatus("Please enter a short bug overview.", "error");
          return;
        }
        const annotations =
          rect && rect.w >= 4 && rect.h >= 4 ? [rect] : [];
        if (!annotations.length) {
          setStatus("Draw a highlight box on the screenshot first.", "error");
          return;
        }
        redraw();
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        cleanup();
        args.onSave({ dataUrl, overview, annotations });
      }
    });
  });

  function cleanup() {
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);
    root.remove();
  }

  // Focus overview for faster typing after highlight
  setTimeout(() => overviewEl.focus(), 50);
}
