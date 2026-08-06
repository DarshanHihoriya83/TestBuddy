import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ExportRecordDoc, RecordExportFormat } from "../utils/recordExport";

const FORMATS: {
  id: RecordExportFormat;
  label: string;
  ext: string;
  blurb: string;
  badge: string;
  tone: string;
}[] = [
  {
    id: "excel",
    label: "Excel",
    ext: ".xlsx",
    blurb: "Best for editing and analysis",
    badge: "X",
    tone: "tb-xfmt-excel",
  },
  {
    id: "json",
    label: "JSON",
    ext: ".json",
    blurb: "Best for data processing",
    badge: "{ }",
    tone: "tb-xfmt-json",
  },
  {
    id: "pdf",
    label: "PDF",
    ext: ".pdf",
    blurb: "Best for sharing and printing",
    badge: "P",
    tone: "tb-xfmt-pdf",
  },
];

function CheckBadge() {
  return (
    <span className="tb-xfmt-check" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Format picker for exporting a single project / module / test case —
 * shown from the row kebab and when exactly one row is selected.
 */
export function SingleExportModal({
  open,
  doc,
  icon,
  detailsLabel,
  detailsHint,
  contentsLoading,
  onClose,
  onExport,
}: {
  open: boolean;
  doc: ExportRecordDoc | null;
  icon?: ReactNode;
  detailsLabel?: string;
  detailsHint?: string;
  contentsLoading?: boolean;
  onClose: () => void;
  onExport: (format: RecordExportFormat, includeDetails: boolean) => Promise<void> | void;
}) {
  const [format, setFormat] = useState<RecordExportFormat>("excel");
  const [includeDetails, setIncludeDetails] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormat("excel");
    setIncludeDetails(true);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !doc) return null;

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await onExport(format, includeDetails);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="tb-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="single-export-title"
        className="tb-card tb-modal-panel tb-xport w-full max-w-lg"
      >
        <div className="tb-xport-head">
          <div className="min-w-0">
            <h2 id="single-export-title" className="tb-xport-title">
              Export {doc.entity}
            </h2>
            <p className="tb-xport-sub">
              Export a single {doc.entity.toLowerCase()} in your preferred format.
            </p>
          </div>
          <button
            type="button"
            className="tb-xport-close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="tb-xport-record">
          <span className="tb-xport-record-icon" aria-hidden>
            {icon ?? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <div className="min-w-0">
            {doc.displayId !== doc.title ? (
              <p className="tb-xport-record-id">{doc.displayId}</p>
            ) : null}
            <p className="tb-xport-record-title">{doc.title}</p>
            {doc.context ? <p className="tb-xport-record-sub">{doc.context}</p> : null}
          </div>
        </div>

        {doc.contents?.length || contentsLoading ? (
          <div className="tb-xport-contents">
            <p className="tb-xport-contents-title">{doc.entity} Contents</p>
            <div className="tb-xport-contents-grid">
              {contentsLoading && !doc.contents?.length
                ? Array.from({ length: 3 }).map((_, i) => (
                    <span key={i} className="tb-xport-content is-loading" aria-hidden />
                  ))
                : doc.contents?.map((item) => (
                    <span key={item.label} className="tb-xport-content">
                      <span className="tb-xport-content-label">{item.label}</span>
                      <span className="tb-xport-content-value">
                        {contentsLoading ? "\u2026" : item.value}
                      </span>
                    </span>
                  ))}
            </div>
          </div>
        ) : null}

        <p className="tb-xport-section-label">Choose Format</p>
        <div className="tb-xport-formats" role="radiogroup" aria-label="Export format">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              disabled={busy}
              className={`tb-xfmt ${f.tone} ${format === f.id ? "is-active" : ""}`}
              onClick={() => setFormat(f.id)}
            >
              {format === f.id ? <CheckBadge /> : null}
              <span className="tb-xfmt-badge" aria-hidden>
                {f.badge}
              </span>
              <span className="tb-xfmt-name">
                {f.label} ({f.ext})
              </span>
              <span className="tb-xfmt-blurb">{f.blurb}</span>
            </button>
          ))}
        </div>

        <p className="tb-xport-section-label">What to Include</p>
        <label className="tb-xport-include">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={includeDetails}
            disabled={busy}
            onChange={(e) => setIncludeDetails(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="tb-xport-include-label">{detailsLabel ?? `${doc.entity} Details`}</span>
            <span className="tb-xport-include-hint">
              {detailsHint ?? "Includes the full field list and related records."}
            </span>
          </span>
        </label>

        <div className="tb-xport-foot">
          <button type="button" className="tb-btn-ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="tb-btn-primary" disabled={busy} onClick={submit}>
            {busy ? "Exporting\u2026" : `Export ${doc.entity}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
