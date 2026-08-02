import type { Bug } from "../types";

export type ExportFormat = "pdf" | "excel" | "json";

export interface BugExportContext {
  bug: Bug;
  projectName: string;
  cycleName: string;
  assigneeName: string;
  reporterName: string;
}

function plain(value?: string | null) {
  return (value ?? "").replace(/\*\*/g, "").trim();
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

function safeFileName(title: string, id: string) {
  const base = title
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return `TestBuddy-${base || "bug"}-${shortId(id)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Human-readable payload used by JSON + shared metadata. */
export function buildReadableBugReport(ctx: BugExportContext) {
  const { bug } = ctx;
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
    cycle: ctx.cycleName,
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
    })),
    screenshots: (bug.screenshots ?? []).map((s, i) => ({
      index: i + 1,
      overview: plain(s.overview) || "Highlighted defect",
      pageUrl: s.pageUrl || "",
      capturedAt: when(s.createdAt),
    })),
  };
}

export async function exportBugAsJson(ctx: BugExportContext) {
  const report = buildReadableBugReport(ctx);
  const payload = {
    ...report,
    // Keep raw bug for tools/import
    raw: ctx.bug,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${safeFileName(ctx.bug.title, ctx.bug.id)}.json`);
}

export async function exportBugAsExcel(ctx: BugExportContext) {
  const XLSX = await import("xlsx");
  const report = buildReadableBugReport(ctx);

  const summaryRows = [
    ["TestBuddy Bug Report"],
    ["Exported", when(report.exportedAt)],
    [],
    ["Field", "Value"],
    ["Bug ID", report.shortId],
    ["Title", report.title],
    ["Status", report.status],
    ["Priority", report.priority],
    ["Severity", report.severity],
    ["Project", report.project],
    ["Cycle", report.cycle],
    ["Assignee", report.assignee],
    ["Reporter", report.reporter],
    ["Filed", report.filedAt],
    ["Updated", report.updatedAt],
    [],
    ["Summary / Description"],
    [report.summary],
  ];

  if (report.defectHighlight) {
    summaryRows.push(
      [],
      ["Defect found at"],
      ["Step #", String(report.defectHighlight.step)],
      ["Action", report.defectHighlight.action],
      ["Actual", report.defectHighlight.actual],
      ["Expected", report.defectHighlight.expected],
    );
  }

  const stepRows = [
    ["#", "Step (action)", "Actual Result", "Expected Result", "Defect?"],
    ...report.steps.map((s) => [
      s.order,
      s.step,
      s.actualResult,
      s.expectedResult === "—" ? "" : s.expectedResult,
      s.isDefectStep ? "YES" : "",
    ]),
  ];

  const shotRows = [
    ["#", "Overview", "Page URL", "Captured"],
    ...(report.screenshots.length
      ? report.screenshots.map((s) => [s.index, s.overview, s.pageUrl, s.capturedAt])
      : [["—", "No screenshots attached", "", ""]]),
  ];

  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 22 }, { wch: 80 }];
  const stepsSheet = XLSX.utils.aoa_to_sheet(stepRows);
  stepsSheet["!cols"] = [{ wch: 5 }, { wch: 45 }, { wch: 40 }, { wch: 40 }, { wch: 10 }];
  const shotsSheet = XLSX.utils.aoa_to_sheet(shotRows);
  shotsSheet["!cols"] = [{ wch: 5 }, { wch: 40 }, { wch: 50 }, { wch: 22 }];

  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(wb, stepsSheet, "Steps");
  XLSX.utils.book_append_sheet(wb, shotsSheet, "Screenshots");
  XLSX.writeFile(wb, `${safeFileName(ctx.bug.title, ctx.bug.id)}.xlsx`);
}

export async function exportBugAsPdf(ctx: BugExportContext) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const report = buildReadableBugReport(ctx);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, pageW, 56, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TestBuddy Bug Report", margin, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Exported ${when(report.exportedAt)}  ·  ID ${report.shortId}`, margin, 44);

  y = 78;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(report.title, pageW - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 18 + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${report.status}  ·  Priority ${report.priority}  ·  Severity ${report.severity}`,
    margin,
    y,
  );
  y += 18;

  // Meta box
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 4, textColor: [15, 23, 42] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 80, textColor: [100, 116, 139] },
      1: { cellWidth: 150 },
      2: { fontStyle: "bold", cellWidth: 80, textColor: [100, 116, 139] },
      3: { cellWidth: 150 },
    },
    body: [
      ["Project", report.project, "Cycle", report.cycle],
      ["Assignee", report.assignee, "Reporter", report.reporter],
      ["Filed", report.filedAt, "Updated", report.updatedAt],
    ],
    margin: { left: margin, right: margin },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Summary", margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const summaryLines = doc.splitTextToSize(report.summary || "—", pageW - margin * 2);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 12 + 14;

  if (report.defectHighlight) {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = margin;
    }
    const actual = doc.splitTextToSize(
      `Actual: ${report.defectHighlight.actual}`,
      pageW - margin * 2 - 20,
    );
    const expected = doc.splitTextToSize(
      `Expected: ${report.defectHighlight.expected}`,
      pageW - margin * 2 - 20,
    );
    const boxH = 28 + actual.length * 11 + expected.length * 11 + 10;
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(252, 165, 165);
    doc.roundedRect(margin, y, pageW - margin * 2, boxH, 5, 5, "FD");
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

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Reproduction steps", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Step", "Actual Result", "Expected Result"]],
    body: report.steps.map((s) => [
      String(s.order),
      s.step,
      s.actualResult,
      s.expectedResult === "—" ? "" : s.expectedResult,
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 4, valign: "top", textColor: [15, 23, 42] },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
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
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 160 },
      2: { cellWidth: 160 },
      3: { cellWidth: 160 },
    },
    margin: { left: margin, right: margin },
  });

  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;

  if (y > doc.internal.pageSize.getHeight() - 80) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Screenshots (${report.screenshots.length})`, margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  if (!report.screenshots.length) {
    doc.text("No screenshots attached.", margin, y);
  } else {
    for (const shot of report.screenshots) {
      const line = doc.splitTextToSize(
        `${shot.index}. ${shot.overview}${shot.pageUrl ? ` — ${shot.pageUrl}` : ""}`,
        pageW - margin * 2,
      );
      if (y + line.length * 11 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += line.length * 11 + 6;
    }
  }

  doc.save(`${safeFileName(ctx.bug.title, ctx.bug.id)}.pdf`);
}

export async function exportBug(
  format: ExportFormat,
  ctx: BugExportContext,
) {
  if (format === "json") return exportBugAsJson(ctx);
  if (format === "excel") return exportBugAsExcel(ctx);
  return exportBugAsPdf(ctx);
}
