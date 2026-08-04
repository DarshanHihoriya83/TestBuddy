import { useEffect } from "react";
import type { ExportFormat } from "../utils/bugExport";

const FORMATS: {
  id: ExportFormat;
  label: string;
  ext: string;
  blurb: string;
  bestFor: string;
  accent: string;
}[] = [
  {
    id: "pdf",
    label: "PDF",
    ext: ".pdf",
    blurb: "One file for all selected bugs — full details + embedded screenshot images.",
    bestFor: "Share with managers / email",
    accent: "border-rose-200 bg-rose-50 hover:border-rose-400",
  },
  {
    id: "excel",
    label: "Excel",
    ext: ".xlsx",
    blurb: "One workbook: Bugs, Steps, Screenshots + embedded images sheet.",
    bestFor: "QA trackers & spreadsheets",
    accent: "border-emerald-200 bg-emerald-50 hover:border-emerald-400",
  },
];

export function ExportFormatModal({
  open,
  busy,
  bugTitle,
  onClose,
  onSelect,
}: {
  open: boolean;
  busy: boolean;
  bugTitle: string;
  onClose: () => void;
  onSelect: (format: ExportFormat) => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-format-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--line)] bg-[var(--panel-elevated)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                Export bug
              </p>
              <h2 id="export-format-title" className="mt-1 text-lg font-bold text-[var(--ink)]">
                Choose a format
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{bugTitle}</p>
            </div>
            <button
              type="button"
              className="tb-btn-ghost px-2.5 py-1 text-xs"
              disabled={busy}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-3 p-5">
          {FORMATS.map((fmt) => (
            <button
              key={fmt.id}
              type="button"
              disabled={busy}
              onClick={() => onSelect(fmt.id)}
              className={`flex w-full items-start gap-4 rounded-xl border px-4 py-3.5 text-left transition-all disabled:opacity-60 ${fmt.accent}`}
            >
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm">
                {fmt.ext.replace(".", "")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold text-[var(--ink)]">{fmt.label}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {fmt.ext}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-slate-600">{fmt.blurb}</span>
                <span className="mt-1.5 block text-xs font-medium text-[var(--accent)]">
                  Best for: {fmt.bestFor}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-[var(--line)] bg-slate-50 px-5 py-3 text-xs text-[var(--muted)]">
          {busy
            ? "Preparing download…"
            : "Tip: PDF is fastest to read end-to-end. Excel is best if you need to edit steps."}
        </div>
      </div>
    </div>
  );
}
