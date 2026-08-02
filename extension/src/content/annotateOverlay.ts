import type { Annotation } from "./bugCapture";
import { encodeScreenshotCanvas } from "../utils/imageCompress";

const OVERLAY_ID = "testbuddy-annotate-overlay";

export type AnnotateResult = {
  dataUrl: string;
  overview: string;
  annotations: Annotation[];
};

type Tool = "rect" | "highlight" | "arrow" | "line" | "pen" | "text";

const COLORS = ["#e11d48", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff", "#0f172a"];

/**
 * Lightshot-style screenshot annotator:
 * pen / line / arrow / rect / highlight / text + color + undo.
 * Draws on a high-res canvas (up to 2560px) and encodes sharp WebP/JPEG.
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
        <div>
          <strong>Annotate screenshot</strong>
          <span>Mark the bug like Lightshot — then add a short overview</span>
        </div>
        <div class="tb-ann-quality" data-quality>HD capture</div>
      </div>

      <div class="tb-ann-workspace">
        <div class="tb-ann-toolbar" role="toolbar" aria-label="Annotation tools">
          <button type="button" data-tool="rect" title="Rectangle" class="is-active">▢</button>
          <button type="button" data-tool="highlight" title="Highlighter">▮</button>
          <button type="button" data-tool="arrow" title="Arrow">➤</button>
          <button type="button" data-tool="line" title="Line">╱</button>
          <button type="button" data-tool="pen" title="Freehand pen">✎</button>
          <button type="button" data-tool="text" title="Text label">T</button>
          <span class="tb-ann-sep"></span>
          <button type="button" data-act="undo" title="Undo">↶</button>
          <button type="button" data-act="clear" title="Clear all">⌫</button>
          <span class="tb-ann-sep"></span>
          <div class="tb-ann-colors" data-colors></div>
        </div>

        <div class="tb-ann-stage">
          <canvas class="tb-ann-canvas"></canvas>
        </div>
      </div>

      <div class="tb-ann-status" aria-live="polite"></div>
      <label class="tb-ann-label">
        Bug overview
        <textarea class="tb-ann-overview" rows="2" maxlength="400"
          placeholder="e.g. Login button shows error instead of signing in"></textarea>
      </label>
      <div class="tb-ann-actions">
        <button type="button" data-act="cancel">Cancel</button>
        <button type="button" class="tb-ann-primary" data-act="save">Save annotated shot</button>
      </div>
      <div class="tb-ann-hint">
        Tip: use Highlight or Rectangle on the defect. Arrow/pen for callouts. Text for short notes.
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const panel = root.querySelector(".tb-ann-panel") as HTMLElement;
  const canvas = root.querySelector(".tb-ann-canvas") as HTMLCanvasElement;
  const overviewEl = root.querySelector(".tb-ann-overview") as HTMLTextAreaElement;
  const statusEl = root.querySelector(".tb-ann-status") as HTMLElement;
  const qualityEl = root.querySelector("[data-quality]") as HTMLElement;
  const colorsEl = root.querySelector("[data-colors]") as HTMLElement;
  const ctxOrNull = canvas.getContext("2d", { alpha: false });
  if (!ctxOrNull) {
    root.remove();
    args.onCancel();
    return;
  }
  const ctx = ctxOrNull;

  let tool: Tool = "rect";
  let color = COLORS[0]!;
  const history: Annotation[] = [];
  let draft: Annotation | null = null;
  let penPoints: { x: number; y: number }[] = [];
  let dragStart: { x: number; y: number } | null = null;
  let drawing = false;
  const img = new Image();

  colorsEl.innerHTML = COLORS.map(
    (c) =>
      `<button type="button" data-color="${c}" style="--swatch:${c}" class="${
        c === color ? "is-active" : ""
      }" title="${c}"></button>`,
  ).join("");

  function setStatus(text: string, kind: "info" | "error" | "ok" = "info") {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  }

  function setTool(next: Tool) {
    tool = next;
    root.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.classList.toggle("is-active", (btn as HTMLElement).dataset.tool === next);
    });
    canvas.dataset.tool = next;
    setStatus(
      next === "text"
        ? "Click where the text should appear."
        : `Tool: ${next} — drag on the image to draw.`,
      "info",
    );
  }

  function setColor(next: string) {
    color = next;
    colorsEl.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", (btn as HTMLElement).dataset.color === next);
    });
  }

  function strokeWidth() {
    return Math.max(2.5, Math.round(canvas.width / 700));
  }

  function drawArrowHead(
    c: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    col: string,
    width: number,
  ) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(12, width * 4);
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
    c.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
    c.closePath();
    c.fillStyle = col;
    c.fill();
  }

  function paintAnnotation(c: CanvasRenderingContext2D, a: Annotation) {
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    switch (a.type) {
      case "rect": {
        c.lineWidth = a.width;
        c.strokeStyle = a.color;
        c.fillStyle = a.color + "33";
        c.fillRect(a.x, a.y, a.w, a.h);
        c.strokeRect(a.x + 0.5, a.y + 0.5, a.w, a.h);
        break;
      }
      case "highlight": {
        c.fillStyle = a.color + "55";
        c.fillRect(a.x, a.y, a.w, a.h);
        c.lineWidth = Math.max(2, a.width * 0.6);
        c.strokeStyle = a.color;
        c.strokeRect(a.x + 0.5, a.y + 0.5, a.w, a.h);
        break;
      }
      case "line": {
        c.strokeStyle = a.color;
        c.lineWidth = a.width;
        c.beginPath();
        c.moveTo(a.x1, a.y1);
        c.lineTo(a.x2, a.y2);
        c.stroke();
        break;
      }
      case "arrow": {
        c.strokeStyle = a.color;
        c.lineWidth = a.width;
        c.beginPath();
        c.moveTo(a.x1, a.y1);
        c.lineTo(a.x2, a.y2);
        c.stroke();
        drawArrowHead(c, a.x1, a.y1, a.x2, a.y2, a.color, a.width);
        break;
      }
      case "pen": {
        if (a.points.length < 2) break;
        c.strokeStyle = a.color;
        c.lineWidth = a.width;
        c.beginPath();
        c.moveTo(a.points[0]!.x, a.points[0]!.y);
        for (let i = 1; i < a.points.length; i++) {
          c.lineTo(a.points[i]!.x, a.points[i]!.y);
        }
        c.stroke();
        break;
      }
      case "text": {
        c.fillStyle = a.color;
        c.font = `bold ${a.size}px "Segoe UI", sans-serif`;
        c.shadowColor = "rgba(0,0,0,0.35)";
        c.shadowBlur = 2;
        c.fillText(a.text, a.x, a.y);
        break;
      }
    }
    c.restore();
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img.complete && img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    for (const a of history) paintAnnotation(ctx, a);
    if (draft) paintAnnotation(ctx, draft);
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

  function commitDraft() {
    if (!draft) return;
    if (draft.type === "rect" || draft.type === "highlight") {
      if (draft.w < 4 || draft.h < 4) {
        draft = null;
        redraw();
        return;
      }
    }
    if (draft.type === "line" || draft.type === "arrow") {
      const dx = draft.x2 - draft.x1;
      const dy = draft.y2 - draft.y1;
      if (Math.hypot(dx, dy) < 6) {
        draft = null;
        redraw();
        return;
      }
    }
    if (draft.type === "pen" && draft.points.length < 2) {
      draft = null;
      redraw();
      return;
    }
    history.push(draft);
    draft = null;
    setStatus(`${history.length} mark(s) on screenshot.`, "ok");
    redraw();
  }

  function onDown(clientX: number, clientY: number, pointerId?: number) {
    const p = canvasPoint(clientX, clientY);
    if (tool === "text") {
      const text = window.prompt("Text to place on screenshot:", "");
      if (text?.trim()) {
        const size = Math.max(16, Math.round(canvas.width / 55));
        history.push({
          type: "text",
          x: p.x,
          y: p.y,
          text: text.trim().slice(0, 120),
          color,
          size,
        });
        setStatus("Text added.", "ok");
        redraw();
      }
      return;
    }

    drawing = true;
    dragStart = p;
    const width = strokeWidth();
    if (tool === "pen") {
      penPoints = [{ ...p }];
      draft = { type: "pen", points: [...penPoints], color, width };
    } else if (tool === "rect") {
      draft = { type: "rect", x: p.x, y: p.y, w: 0, h: 0, color, width };
    } else if (tool === "highlight") {
      draft = { type: "highlight", x: p.x, y: p.y, w: 0, h: 0, color, width };
    } else if (tool === "line") {
      draft = { type: "line", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width };
    } else if (tool === "arrow") {
      draft = { type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width };
    }
    if (pointerId != null) {
      try {
        canvas.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function onMove(clientX: number, clientY: number) {
    if (!drawing || !dragStart || !draft) return;
    const p = canvasPoint(clientX, clientY);
    if (draft.type === "pen") {
      penPoints.push(p);
      draft = { ...draft, points: [...penPoints] };
    } else if (draft.type === "rect" || draft.type === "highlight") {
      draft = {
        ...draft,
        x: Math.min(dragStart.x, p.x),
        y: Math.min(dragStart.y, p.y),
        w: Math.abs(p.x - dragStart.x),
        h: Math.abs(p.y - dragStart.y),
      };
    } else if (draft.type === "line" || draft.type === "arrow") {
      draft = { ...draft, x2: p.x, y2: p.y };
    }
    redraw();
  }

  function onUp() {
    if (!drawing) return;
    drawing = false;
    dragStart = null;
    commitDraft();
  }

  img.onload = () => {
    const maxEdge = 2560;
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = long > maxEdge ? maxEdge / long : 1;
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

    const maxDisplayW = Math.min(window.innerWidth - 120, 1100);
    const maxDisplayH = Math.min(window.innerHeight - 280, 720);
    const displayScale = Math.min(maxDisplayW / canvas.width, maxDisplayH / canvas.height, 1);
    canvas.style.width = `${Math.round(canvas.width * displayScale)}px`;
    canvas.style.height = `${Math.round(canvas.height * displayScale)}px`;

    qualityEl.textContent = `${canvas.width}×${canvas.height} · sharp encode`;
    redraw();
    setStatus("Pick a tool, mark the bug, then save.", "info");
  };
  img.onerror = () => setStatus("Could not load screenshot image.", "error");
  img.src = args.dataUrl;

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

  const stopBubble = (e: Event) => e.stopPropagation();
  for (const type of ["click", "mousedown", "mouseup", "mousemove", "pointerdown", "keydown", "keyup"]) {
    root.addEventListener(type, stopBubble, false);
  }
  root.addEventListener("mousedown", (e) => {
    if (e.target === root) e.preventDefault();
  });
  panel.addEventListener("mousedown", (e) => e.stopPropagation());

  root.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setTool((btn as HTMLElement).dataset.tool as Tool);
    });
  });

  colorsEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const c = (btn as HTMLElement).dataset.color;
      if (c) setColor(c);
    });
  });

  root.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const act = (btn as HTMLButtonElement).dataset.act;
      if (act === "undo") {
        history.pop();
        redraw();
        setStatus(history.length ? `${history.length} mark(s) left.` : "Cleared last mark.", "info");
      } else if (act === "clear") {
        history.length = 0;
        draft = null;
        redraw();
        setStatus("All marks cleared.", "info");
      } else if (act === "cancel") {
        cleanup();
        args.onCancel();
      } else if (act === "save") {
        void (async () => {
          const overview = overviewEl.value.trim();
          if (!overview) {
            overviewEl.focus();
            setStatus("Please enter a short bug overview.", "error");
            return;
          }
          if (!history.length) {
            setStatus("Add at least one highlight / arrow / mark first.", "error");
            return;
          }
          setStatus("Encoding sharp screenshot…", "info");
          try {
            redraw();
            const encoded = await encodeScreenshotCanvas(canvas);
            const kb = Math.round(encoded.bytes / 1024);
            qualityEl.textContent = `${canvas.width}×${canvas.height} · ${kb} KB`;
            cleanup();
            args.onSave({
              dataUrl: encoded.dataUrl,
              overview,
              annotations: history.slice(),
            });
          } catch (err) {
            setStatus(err instanceof Error ? err.message : "Encode failed", "error");
          }
        })();
      }
    });
  });

  function cleanup() {
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);
    root.remove();
  }

  setTimeout(() => overviewEl.focus(), 80);
}
