export type RecordExportFormat = "excel" | "json" | "pdf";

export interface ExportField {
  label: string;
  value: string;
}

export interface ExportSection {
  title: string;
  columns: string[];
  rows: string[][];
}

/** One record (project / module / test case) rendered into a shareable file. */
export interface ExportRecordDoc {
  /** "Project" | "Module" | "Test Case" — used in titles and file names. */
  entity: string;
  displayId: string;
  title: string;
  context?: string;
  /** Counts of what the export covers — always included. */
  contents?: ExportField[];
  /** Always exported. */
  summary: ExportField[];
  /** Exported only when the user keeps "details" checked. */
  details?: ExportField[];
  sections?: ExportSection[];
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string, max = 40) {
  return (
    value
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, max) || "export"
  );
}

function fileBase(doc: ExportRecordDoc) {
  return `TestBuddy-${slug(doc.entity, 20)}-${slug(doc.displayId, 20)}-${stamp()}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function resolveParts(doc: ExportRecordDoc, includeDetails: boolean) {
  const fields = includeDetails ? [...doc.summary, ...(doc.details ?? [])] : doc.summary;
  const sections = includeDetails ? (doc.sections ?? []) : [];
  return { fields, sections };
}

function exportAsJson(doc: ExportRecordDoc, includeDetails: boolean) {
  const { fields, sections } = resolveParts(doc, includeDetails);
  const payload = {
    exportedAt: new Date().toISOString(),
    entity: doc.entity,
    id: doc.displayId,
    title: doc.title,
    context: doc.context ?? null,
    ...(doc.contents?.length
      ? { contents: Object.fromEntries(doc.contents.map((c) => [c.label, c.value])) }
      : {}),
    fields: Object.fromEntries(fields.map((f) => [f.label, f.value])),
    ...(sections.length
      ? {
          sections: sections.map((section) => ({
            title: section.title,
            rows: section.rows.map((row) =>
              Object.fromEntries(section.columns.map((col, i) => [col, row[i] ?? ""])),
            ),
          })),
        }
      : {}),
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `${fileBase(doc)}.json`,
  );
}

async function exportAsExcel(doc: ExportRecordDoc, includeDetails: boolean) {
  const { fields, sections } = resolveParts(doc, includeDetails);
  // Resolved via vite alias → exceljs browser build
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TestBuddy";
  wb.created = new Date();

  const sheet = wb.addWorksheet(doc.entity);
  sheet.columns = [
    { header: "Field", key: "label", width: 26 },
    { header: "Value", key: "value", width: 70 },
  ];
  sheet.getRow(1).font = { bold: true };
  if (doc.contents?.length) {
    for (const c of doc.contents) sheet.addRow({ label: c.label, value: c.value });
    sheet.addRow({});
  }
  for (const f of fields) sheet.addRow({ label: f.label, value: f.value });
  sheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  for (const section of sections) {
    const s = wb.addWorksheet(section.title.slice(0, 30));
    s.columns = section.columns.map((c) => ({
      header: c,
      key: c,
      width: c.length <= 4 ? 8 : 42,
    }));
    s.getRow(1).font = { bold: true };
    for (const row of section.rows) s.addRow(row);
    s.eachRow((r: any) => {
      r.alignment = { wrapText: true, vertical: "top" };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileBase(doc)}.xlsx`,
  );
}

async function exportAsPdf(doc: ExportRecordDoc, includeDetails: boolean) {
  const { fields, sections } = resolveParts(doc, includeDetails);
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = pdf.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;

  pdf.setFillColor(0, 120, 212);
  pdf.rect(0, 0, pageW, 74, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(`TestBuddy ${doc.entity} Export`, margin, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(
    [doc.displayId, doc.context, new Date().toLocaleString()].filter(Boolean).join("  ·  "),
    margin,
    52,
  );

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  const titleLines = pdf.splitTextToSize(doc.title, contentW);
  pdf.text(titleLines, margin, 100);

  let y = 100 + titleLines.length * 17 + 8;

  autoTable(pdf, {
    startY: y,
    head: [["Field", "Value"]],
    body: [...(doc.contents ?? []).map((c) => [c.label, c.value]), ...fields.map((f) => [f.label, f.value])],
    theme: "grid",
    tableWidth: contentW,
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 130, fontStyle: "bold", textColor: [71, 85, 105] } },
    margin: { left: margin, right: margin },
  });
  y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;

  for (const section of sections) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(section.title, margin, y);
    y += 8;
    autoTable(pdf, {
      startY: y,
      head: [section.columns],
      body: section.rows.length ? section.rows : [section.columns.map(() => "\u2014")],
      theme: "grid",
      tableWidth: contentW,
      styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    });
    y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;
  }

  pdf.save(`${fileBase(doc)}.pdf`);
}

export async function exportRecord(
  format: RecordExportFormat,
  doc: ExportRecordDoc,
  { includeDetails = true }: { includeDetails?: boolean } = {},
) {
  if (format === "json") return exportAsJson(doc, includeDetails);
  if (format === "excel") return exportAsExcel(doc, includeDetails);
  return exportAsPdf(doc, includeDetails);
}

function bulkFileBase(entity: string, count: number) {
  return `TestBuddy-${slug(entity, 24)}-${count}-items-${stamp()}`;
}

/** Export many records as one Excel / JSON / PDF file. */
export async function exportRecords(
  format: RecordExportFormat,
  docs: ExportRecordDoc[],
  { includeDetails = true }: { includeDetails?: boolean } = {},
) {
  if (!docs.length) throw new Error("No items selected to export");
  if (docs.length === 1) return exportRecord(format, docs[0]!, { includeDetails });

  const entity = docs[0]!.entity;
  const plural = entity.endsWith("s") ? entity : `${entity}s`;

  if (format === "json") {
    const payload = {
      exportedAt: new Date().toISOString(),
      entity: plural,
      count: docs.length,
      items: docs.map((doc) => {
        const { fields, sections } = resolveParts(doc, includeDetails);
        return {
          id: doc.displayId,
          title: doc.title,
          context: doc.context ?? null,
          ...(doc.contents?.length
            ? { contents: Object.fromEntries(doc.contents.map((c) => [c.label, c.value])) }
            : {}),
          fields: Object.fromEntries(fields.map((f) => [f.label, f.value])),
          ...(sections.length
            ? {
                sections: sections.map((section) => ({
                  title: section.title,
                  rows: section.rows.map((row) =>
                    Object.fromEntries(section.columns.map((col, i) => [col, row[i] ?? ""])),
                  ),
                })),
              }
            : {}),
        };
      }),
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `${bulkFileBase(plural, docs.length)}.json`,
    );
    return;
  }

  if (format === "excel") {
    const mod: any = await import("exceljs");
    const ExcelJS = mod.default ?? mod;
    const wb = new ExcelJS.Workbook();
    wb.creator = "TestBuddy";
    wb.created = new Date();
    const sheet = wb.addWorksheet(plural.slice(0, 30));
    const headers = ["ID", "Title", "Context", "Field", "Value"];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    for (const doc of docs) {
      const { fields } = resolveParts(doc, includeDetails);
      for (const f of fields) {
        sheet.addRow([doc.displayId, doc.title, doc.context ?? "", f.label, f.value]);
      }
      if (includeDetails) {
        for (const section of doc.sections ?? []) {
          for (const row of section.rows) {
            sheet.addRow([
              doc.displayId,
              doc.title,
              section.title,
              row[0] ?? "",
              row.slice(1).join(" | "),
            ]);
          }
        }
      }
    }
    sheet.columns = [
      { width: 16 },
      { width: 36 },
      { width: 22 },
      { width: 22 },
      { width: 50 },
    ];
    const buffer = await wb.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${bulkFileBase(plural, docs.length)}.xlsx`,
    );
    return;
  }

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = pdf.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;

  pdf.setFillColor(0, 120, 212);
  pdf.rect(0, 0, pageW, 74, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(`TestBuddy ${plural} Export`, margin, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`${docs.length} item(s)  ·  ${new Date().toLocaleString()}`, margin, 52);

  let y = 100;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    const { fields } = resolveParts(doc, includeDetails);
    if (i > 0) {
      pdf.addPage();
      y = margin;
    }
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    const titleLines = pdf.splitTextToSize(`${doc.displayId} — ${doc.title}`, contentW);
    pdf.text(titleLines, margin, y);
    y += titleLines.length * 16 + 8;
    autoTable(pdf, {
      startY: y,
      head: [["Field", "Value"]],
      body: [
        ...(doc.contents ?? []).map((c) => [c.label, c.value]),
        ...fields.map((f) => [f.label, f.value]),
      ],
      theme: "grid",
      tableWidth: contentW,
      styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 130, fontStyle: "bold", textColor: [71, 85, 105] } },
      margin: { left: margin, right: margin },
    });
  }
  pdf.save(`${bulkFileBase(plural, docs.length)}.pdf`);
}
