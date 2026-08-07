import type { Bug, BugScreenshot } from "../types";

export type ExportFormat = "pdf" | "excel";

export interface BugExportContext {
  bug: Bug;
  projectName: string;
  sprintName: string;
  assigneeName: string;
  reporterName: string;
}

interface ShotWithImage extends BugScreenshot {
  dataUrl?: string | null;
}

interface EnrichedContext extends BugExportContext {
  shots: ShotWithImage[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function plain(value?: string | null) {
  return (value ?? "").replace(/\*\*/g, "").trim();
}

/** Clean + wrap-friendly text for PDF table cells (stops overflow / garbled runs). */
function pdfSafeText(value?: string | null, maxLen = 1500): string {
  let t = plain(value);
  // Strip Excel-style rich-text control runs (&B&, &C&, &I&, …)
  t = t.replace(/&[A-Za-z]{1,3}&/g, "");
  // Collapse leftover lone & markers between letters (e.g. &C&I&i&)
  t = t.replace(/(?:&[A-Za-z])+&?/g, (m) => m.replace(/&/g, ""));
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  // Soft-break long unbroken tokens (URLs, jammed strings) so autoTable wraps
  t = t.replace(/(\S{28})/g, "$1\u200b");
  if (t.length > maxLen) t = `${t.slice(0, maxLen - 1)}…`;
  return t;
}

function when(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function safeProjectSlug(name: string) {
  return name
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40) || "bugs";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dataUrlMime(dataUrl: string): string {
  const m = /^data:([^;]+);/i.exec(dataUrl);
  return m?.[1] ?? "image/png";
}

function excelImageExtension(dataUrl: string): "png" | "jpeg" | "gif" {
  const mime = dataUrlMime(dataUrl).toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("gif")) return "gif";
  return "png";
}

function pdfImageFormat(dataUrl: string): "JPEG" | "PNG" {
  const mime = dataUrlMime(dataUrl).toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "JPEG";
  return "PNG";
}

/** Normalize to PNG/JPEG so PDF + Excel can embed reliably (incl. WebP). */
async function normalizeImageDataUrl(dataUrl: string): Promise<string | null> {
  const mime = dataUrlMime(dataUrl).toLowerCase();
  if (mime.includes("png") || mime.includes("jpeg") || mime.includes("jpg")) {
    return dataUrl;
  }
  return await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const g = canvas.getContext("2d");
        if (!g || !canvas.width || !canvas.height) {
          resolve(null);
          return;
        }
        g.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function fetchScreenshotDataUrl(src: string): Promise<string | null> {
  try {
    const token = localStorage.getItem("testbuddy_token");
    const res = await fetch(`${API_BASE}${src}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const raw = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!raw) return null;
    return (await normalizeImageDataUrl(raw)) ?? raw;
  } catch {
    return null;
  }
}

async function enrichContexts(contexts: BugExportContext[]): Promise<EnrichedContext[]> {
  const out: EnrichedContext[] = [];
  for (const ctx of contexts) {
    const shots: ShotWithImage[] = [];
    for (const shot of ctx.bug.screenshots ?? []) {
      const dataUrl = shot.url ? await fetchScreenshotDataUrl(shot.url) : null;
      shots.push({ ...shot, dataUrl });
    }
    out.push({ ...ctx, shots });
  }
  return out;
}

function buildReadableBugReport(ctx: EnrichedContext) {
  const { bug, shots } = ctx;
  const defectStep = bug.steps.find((s) => !!s.expectedResult?.trim());

  return {
    reportTitle: "TestBuddy Bug Report",
    exportedAt: new Date().toISOString(),
    bugId: bug.id,
    shortId: shortId(bug.id),
    title: bug.title,
    status: bug.status,
    priority: bug.priority,
    severity: bug.severity,
    project: ctx.projectName,
    sprint: ctx.sprintName,
    assignee: ctx.assigneeName,
    reporter: ctx.reporterName,
    filedAt: when(bug.createdAt),
    updatedAt: when(bug.updatedAt),
    summary: plain(bug.description),
    defectHighlight: defectStep
      ? {
          step: defectStep.order,
          action: plain(defectStep.description),
          actual: plain(defectStep.actualResult),
          expected: plain(defectStep.expectedResult),
        }
      : null,
    steps: bug.steps.map((s) => ({
      order: s.order,
      step: plain(s.description),
      actualResult: plain(s.actualResult) || "—",
      expectedResult: plain(s.expectedResult) || "—",
      isDefectStep: !!s.expectedResult?.trim(),
      pageUrl: s.pageUrl || "",
      screenshotId: s.screenshotId || "",
    })),
    screenshots: shots.map((s, i) => ({
      index: i + 1,
      id: s.id,
      overview: plain(s.overview) || "Highlighted defect",
      pageUrl: s.pageUrl || "",
      capturedAt: when(s.createdAt),
      contentType: s.contentType || dataUrlMime(s.dataUrl || "") || "",
      annotations: s.annotations ?? [],
      /** Full image for re-import / offline viewing */
      dataUrl: s.dataUrl || null,
    })),
  };
}

function exportFileBase(contexts: EnrichedContext[]) {
  const project = contexts[0]?.projectName || "TestBuddy";
  const stamp = new Date().toISOString().slice(0, 10);
  if (contexts.length === 1) {
    const b = contexts[0]!;
    const title = b.bug.title
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 40);
    return `TestBuddy-${title || "bug"}-${shortId(b.bug.id)}`;
  }
  return `TestBuddy-${safeProjectSlug(project)}-${contexts.length}-bugs-${stamp}`;
}

async function exportBugsAsExcel(contexts: EnrichedContext[]) {
  // Resolved via vite alias → exceljs/dist/exceljs.min.js (browser build)
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TestBuddy";
  wb.created = new Date();

  const index = wb.addWorksheet("Bugs");
  index.columns = [
    { header: "Bug ID", key: "id", width: 12 },
    { header: "Title", key: "title", width: 45 },
    { header: "Status", key: "status", width: 12 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Severity", key: "severity", width: 10 },
    { header: "Project", key: "project", width: 20 },
    { header: "Sprint", key: "sprint", width: 14 },
    { header: "Assignee", key: "assignee", width: 18 },
    { header: "Reporter", key: "reporter", width: 18 },
    { header: "Filed", key: "filed", width: 20 },
    { header: "Updated", key: "updated", width: 20 },
    { header: "Summary", key: "summary", width: 50 },
    { header: "Steps", key: "steps", width: 8 },
    { header: "Screenshots", key: "shots", width: 12 },
  ];
  index.getRow(1).font = { bold: true };

  const stepsSheet = wb.addWorksheet("Steps");
  stepsSheet.columns = [
    { header: "Bug ID", key: "bugId", width: 12 },
    { header: "Bug Title", key: "bugTitle", width: 35 },
    { header: "#", key: "order", width: 5 },
    { header: "Step (action)", key: "step", width: 40 },
    { header: "Actual Result", key: "actual", width: 35 },
    { header: "Expected Result", key: "expected", width: 35 },
    { header: "Defect?", key: "defect", width: 10 },
    { header: "Page URL", key: "pageUrl", width: 40 },
  ];
  stepsSheet.getRow(1).font = { bold: true };

  const shotsMeta = wb.addWorksheet("Screenshots");
  shotsMeta.columns = [
    { header: "Bug ID", key: "bugId", width: 12 },
    { header: "Bug Title", key: "bugTitle", width: 35 },
    { header: "#", key: "index", width: 5 },
    { header: "Overview", key: "overview", width: 40 },
    { header: "Page URL", key: "pageUrl", width: 40 },
    { header: "Captured", key: "captured", width: 20 },
    { header: "Has Image", key: "hasImage", width: 12 },
  ];
  shotsMeta.getRow(1).font = { bold: true };

  const imagesSheet = wb.addWorksheet("Screenshot Images");
  imagesSheet.getCell("A1").value = "Bug ID";
  imagesSheet.getCell("B1").value = "Bug Title";
  imagesSheet.getCell("C1").value = "#";
  imagesSheet.getCell("D1").value = "Overview";
  imagesSheet.getCell("E1").value = "Image";
  imagesSheet.getRow(1).font = { bold: true };
  imagesSheet.getColumn(1).width = 12;
  imagesSheet.getColumn(2).width = 28;
  imagesSheet.getColumn(3).width = 5;
  imagesSheet.getColumn(4).width = 30;
  imagesSheet.getColumn(5).width = 48;

  let imageRow = 2;

  for (const ctx of contexts) {
    const report = buildReadableBugReport(ctx);
    index.addRow({
      id: report.shortId,
      title: report.title,
      status: report.status,
      priority: report.priority,
      severity: report.severity,
      project: report.project,
      sprint: report.sprint,
      assignee: report.assignee,
      reporter: report.reporter,
      filed: report.filedAt,
      updated: report.updatedAt,
      summary: report.summary,
      steps: report.steps.length,
      shots: report.screenshots.length,
    });

    for (const s of report.steps) {
      stepsSheet.addRow({
        bugId: report.shortId,
        bugTitle: report.title,
        order: s.order,
        step: s.step,
        actual: s.actualResult,
        expected: s.expectedResult === "—" ? "" : s.expectedResult,
        defect: s.isDefectStep ? "YES" : "",
        pageUrl: s.pageUrl,
      });
    }

    for (const shot of report.screenshots) {
      shotsMeta.addRow({
        bugId: report.shortId,
        bugTitle: report.title,
        index: shot.index,
        overview: shot.overview,
        pageUrl: shot.pageUrl,
        captured: shot.capturedAt,
        hasImage: shot.dataUrl ? "YES" : "NO",
      });

      imagesSheet.getCell(imageRow, 1).value = report.shortId;
      imagesSheet.getCell(imageRow, 2).value = report.title;
      imagesSheet.getCell(imageRow, 3).value = shot.index;
      imagesSheet.getCell(imageRow, 4).value = shot.overview;

      if (shot.dataUrl) {
        try {
          const imageId = wb.addImage({
            base64: shot.dataUrl.replace(/^data:[^;]+;base64,/, ""),
            extension: excelImageExtension(shot.dataUrl),
          });
          imagesSheet.getRow(imageRow).height = 140;
          imagesSheet.addImage(imageId, {
            tl: { col: 4, row: imageRow - 1 },
            ext: { width: 320, height: 180 },
            editAs: "oneCell",
          });
        } catch {
          imagesSheet.getCell(imageRow, 5).value = "(image embed failed)";
        }
      } else {
        imagesSheet.getCell(imageRow, 5).value = "(image unavailable)";
      }
      imageRow += 1;
    }

    if (!report.screenshots.length) {
      shotsMeta.addRow({
        bugId: report.shortId,
        bugTitle: report.title,
        index: "—",
        overview: "No screenshots attached",
        pageUrl: "",
        captured: "",
        hasImage: "NO",
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${exportFileBase(contexts)}.xlsx`,
  );
}

function ensureSpace(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  y: number,
  need: number,
  margin: number,
) {
  if (y + need > doc.internal.pageSize.getHeight() - margin - 24) {
    doc.addPage();
    return margin;
  }
  return y;
}

function addPageFooter(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  pageW: number,
  pageH: number,
  margin: number,
) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.6);
    doc.line(margin, pageH - 28, pageW - margin, pageH - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("TestBuddy bug report", margin, pageH - 14);
    doc.text(`Page ${p} of ${total}`, pageW - margin, pageH - 14, { align: "right" });
  }
}

function sectionTitle(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  label: string,
  y: number,
  margin: number,
  pageW: number,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(label, margin, y);
  doc.setDrawColor(13, 148, 136);
  doc.setLineWidth(1.5);
  doc.line(margin, y + 4, margin + Math.min(120, pageW - margin * 2), y + 4);
  return y + 14;
}

async function measureImageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        w: img.naturalWidth || img.width || 1,
        h: img.naturalHeight || img.height || 1,
      });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function exportBugsAsPdf(contexts: EnrichedContext[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;

  type TocHit = { x: number; y: number; w: number; h: number };
  const tocHits: TocHit[] = [];
  const bugStartPages: number[] = [];

  // Cover
  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, pageW, 78, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("TestBuddy Bug Export", margin, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `${contexts.length} bug(s)  ·  ${pdfSafeText(contexts[0]?.projectName || "—", 60)}  ·  ${when(new Date().toISOString())}`,
    margin,
    54,
  );
  doc.setFontSize(8);
  doc.text("Tip: click a Contents row to jump to that bug. Use ← Contents on each bug page to return.", margin, 70);

  let y = 100;
  y = sectionTitle(doc, "Contents", y, margin, pageW);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Click any row to open that bug’s full details, steps, and screenshots.", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["#", "ID", "Title", "Status", "Priority", "Shots"]],
    body: contexts.map((ctx, i) => {
      const r = buildReadableBugReport(ctx);
      return [
        String(i + 1),
        r.shortId,
        pdfSafeText(r.title, 180),
        pdfSafeText(r.status, 40),
        pdfSafeText(r.priority, 20),
        String(r.screenshots.length),
      ];
    }),
    theme: "grid",
    tableWidth: contentW,
    styles: {
      fontSize: 8,
      cellPadding: 5,
      overflow: "linebreak",
      valign: "middle",
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      1: { cellWidth: 58, fontStyle: "bold" },
      2: { cellWidth: contentW - 24 - 58 - 58 - 52 - 40, textColor: [0, 120, 212], fontStyle: "bold" },
      3: { cellWidth: 58 },
      4: { cellWidth: 52 },
      5: { cellWidth: 40, halign: "center" },
    },
    margin: { left: margin, right: margin },
    didDrawCell(data) {
      if (data.section !== "body") return;
      if (data.column.index === 0) {
        tocHits[data.row.index] = {
          x: data.cell.x,
          y: data.cell.y,
          w: contentW,
          h: data.cell.height,
        };
      }
    },
  });

  for (let i = 0; i < contexts.length; i++) {
    const ctx = contexts[i]!;
    const report = buildReadableBugReport(ctx);
    doc.addPage();
    bugStartPages[i] = doc.getCurrentPageInfo().pageNumber;
    y = margin;

    doc.setFillColor(13, 148, 136);
    doc.rect(0, 0, pageW, 52, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(
      `Bug ${i + 1} of ${contexts.length}  ·  ${report.shortId}`,
      margin,
      24,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Exported ${when(report.exportedAt)}`, margin, 40);

    const backLabel = "← Contents";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const backW = doc.getTextWidth(backLabel) + 14;
    const backX = pageW - margin - backW;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(backX, 14, backW, 22, 4, 4, "F");
    doc.setTextColor(13, 148, 136);
    doc.text(backLabel, backX + 7, 29);
    doc.link(backX, 14, backW, 22, { pageNumber: 1 });

    y = 72;
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    const titleLines = doc.splitTextToSize(pdfSafeText(report.title, 240), contentW);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 16 + 10;

    // Status chips
    const chips = [
      pdfSafeText(report.status, 30),
      `Priority ${pdfSafeText(report.priority, 16)}`,
      `Severity ${pdfSafeText(report.severity, 16)}`,
    ];
    let chipX = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    for (const chip of chips) {
      const tw = doc.getTextWidth(chip) + 14;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(chipX, y - 9, tw, 16, 3, 3, "FD");
      doc.setTextColor(51, 65, 85);
      doc.text(chip, chipX + 7, y + 2);
      chipX += tw + 6;
    }
    y += 18;

    autoTable(doc, {
      startY: y,
      theme: "plain",
      tableWidth: contentW,
      styles: {
        fontSize: 9,
        cellPadding: { top: 3, bottom: 3, left: 2, right: 4 },
        overflow: "linebreak",
        textColor: [15, 23, 42],
        valign: "top",
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 72, textColor: [100, 116, 139] },
        1: { cellWidth: (contentW - 144) / 2 },
        2: { fontStyle: "bold", cellWidth: 72, textColor: [100, 116, 139] },
        3: { cellWidth: (contentW - 144) / 2 },
      },
      body: [
        [
          "Project",
          pdfSafeText(report.project, 80),
          "Sprint",
          pdfSafeText(report.sprint, 40),
        ],
        [
          "Assignee",
          pdfSafeText(report.assignee, 60),
          "Reporter",
          pdfSafeText(report.reporter, 60),
        ],
        ["Filed", report.filedAt, "Updated", report.updatedAt],
      ],
      margin: { left: margin, right: margin },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;

    y = ensureSpace(doc, y, 60, margin);
    y = sectionTitle(doc, "Summary", y, margin, pageW);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const summaryLines = doc.splitTextToSize(
      pdfSafeText(report.summary || "—", 2000),
      contentW,
    );
    y = ensureSpace(doc, y, summaryLines.length * 11 + 16, margin);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 11 + 14;

    if (report.defectHighlight) {
      const actual = doc.splitTextToSize(
        `Actual: ${pdfSafeText(report.defectHighlight.actual, 500)}`,
        contentW - 20,
      );
      const expected = doc.splitTextToSize(
        `Expected: ${pdfSafeText(report.defectHighlight.expected, 500)}`,
        contentW - 20,
      );
      const boxH = 28 + actual.length * 11 + expected.length * 11 + 12;
      y = ensureSpace(doc, y, boxH + 16, margin);
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(252, 165, 165);
      doc.roundedRect(margin, y, contentW, boxH, 5, 5, "FD");
      doc.setTextColor(185, 28, 28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Defect found at step ${report.defectHighlight.step}`, margin + 10, y + 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(127, 29, 29);
      doc.text(actual, margin + 10, y + 32);
      doc.text(expected, margin + 10, y + 32 + actual.length * 11 + 4);
      y += boxH + 16;
    }

    y = ensureSpace(doc, y, 50, margin);
    y = sectionTitle(doc, "Reproduction steps", y, margin, pageW);

    const stepCol = 24;
    const otherCol = (contentW - stepCol) / 3;

    autoTable(doc, {
      startY: y,
      head: [["#", "Step", "Actual Result", "Expected Result"]],
      body: report.steps.map((s) => [
        String(s.order),
        pdfSafeText(s.step, 600),
        pdfSafeText(s.actualResult === "—" ? "" : s.actualResult, 600) || "—",
        s.expectedResult === "—" ? "" : pdfSafeText(s.expectedResult, 600),
      ]),
      theme: "grid",
      tableWidth: contentW,
      showHead: "everyPage",
      styles: {
        fontSize: 8,
        cellPadding: 5,
        overflow: "linebreak",
        valign: "top",
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.4,
        minCellHeight: 18,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        overflow: "linebreak",
        valign: "middle",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell(data) {
        const row = report.steps[data.row.index];
        if (data.section === "body" && row?.isDefectStep) {
          data.cell.styles.fillColor = [254, 226, 226];
          if (data.column.index === 3) {
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fontStyle = "bold";
          }
        }
        // Keep cells inside table — never expand past column width
        data.cell.styles.overflow = "linebreak";
      },
      columnStyles: {
        0: { cellWidth: stepCol, halign: "center", fontStyle: "bold" },
        1: { cellWidth: otherCol },
        2: { cellWidth: otherCol },
        3: { cellWidth: otherCol },
      },
      margin: { left: margin, right: margin, bottom: 40 },
    });

    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;

    y = ensureSpace(doc, y, 50, margin);
    y = sectionTitle(
      doc,
      `Screenshots (${report.screenshots.length})`,
      y,
      margin,
      pageW,
    );

    if (!report.screenshots.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("No screenshots attached.", margin, y);
    } else {
      for (const shot of report.screenshots) {
        const caption = doc.splitTextToSize(
          `${shot.index}. ${pdfSafeText(shot.overview, 200)}${
            shot.pageUrl ? ` — ${pdfSafeText(shot.pageUrl, 120)}` : ""
          }`,
          contentW,
        );

        let imgW = contentW;
        let imgH = 210;
        if (shot.dataUrl) {
          const size = await measureImageSize(shot.dataUrl);
          if (size) {
            const ratio = size.h / size.w;
            imgW = contentW;
            imgH = Math.min(280, Math.max(120, imgW * ratio));
          }
        }

        y = ensureSpace(
          doc,
          y,
          caption.length * 11 + (shot.dataUrl ? imgH + 28 : 24),
          margin,
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(caption, margin, y);
        y += caption.length * 11 + 8;

        if (shot.dataUrl) {
          try {
            if (y + imgH + 12 > pageH - margin - 28) {
              doc.addPage();
              y = margin;
            }
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin - 2, y - 2, imgW + 4, imgH + 4, 4, 4, "FD");
            doc.addImage(
              shot.dataUrl,
              pdfImageFormat(shot.dataUrl),
              margin,
              y,
              imgW,
              imgH,
              undefined,
              "FAST",
            );
            y += imgH + 18;
          } catch {
            doc.setTextColor(185, 28, 28);
            doc.setFont("helvetica", "normal");
            doc.text("(Could not embed screenshot image)", margin, y);
            y += 16;
          }
        } else {
          doc.setTextColor(185, 28, 28);
          doc.setFont("helvetica", "normal");
          doc.text("(Screenshot image unavailable)", margin, y);
          y += 16;
        }
      }
    }
  }

  doc.setPage(1);
  for (let i = 0; i < tocHits.length; i++) {
    const hit = tocHits[i];
    const pageNumber = bugStartPages[i];
    if (!hit || !pageNumber) continue;
    doc.link(hit.x, hit.y, hit.w, hit.h, { pageNumber });
  }

  try {
    doc.outline.add(null, "Contents", { pageNumber: 1 });
    for (let i = 0; i < contexts.length; i++) {
      const r = buildReadableBugReport(contexts[i]!);
      const pageNumber = bugStartPages[i];
      if (!pageNumber) continue;
      doc.outline.add(null, `${i + 1}. ${r.shortId} — ${r.title}`.slice(0, 80), {
        pageNumber,
      });
    }
  } catch {
    // optional
  }

  addPageFooter(doc, pageW, pageH, margin);
  doc.save(`${exportFileBase(contexts)}.pdf`);
}

/** Export one or many bugs as a single PDF or Excel file with full info + screenshots. */
export async function exportBugs(format: ExportFormat, contexts: BugExportContext[]) {
  if (!contexts.length) throw new Error("No bugs selected to export");
  const enriched = await enrichContexts(contexts);
  if (format === "excel") return exportBugsAsExcel(enriched);
  return exportBugsAsPdf(enriched);
}

/** Single-bug convenience wrapper. */
export async function exportBug(format: ExportFormat, ctx: BugExportContext) {
  return exportBugs(format, [ctx]);
}
