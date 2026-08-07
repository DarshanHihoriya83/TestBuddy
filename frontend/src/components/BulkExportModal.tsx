import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { RecordExportFormat } from "../utils/recordExport";

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
    blurb: "Best for analysis & reporting",
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

/** Animated export scene for the preview sidebar (Excel / JSON / PDF + cloud). */
function ExportPreviewArt({ active }: { active: RecordExportFormat }) {
  return (
    <div className="tb-bulk-art" aria-hidden>
      <div className="tb-bulk-art-glow" />
      <div className="tb-bulk-art-platform" />
      <span className={`tb-bulk-art-file is-excel ${active === "excel" ? "is-active" : ""}`}>
        <span>X</span>
      </span>
      <span className={`tb-bulk-art-file is-json ${active === "json" ? "is-active" : ""}`}>
        <span>{"{ }"}</span>
      </span>
      <span className={`tb-bulk-art-file is-pdf ${active === "pdf" ? "is-active" : ""}`}>
        <span>P</span>
      </span>
      <div className="tb-bulk-art-cloud">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M7.5 18h9.2a3.8 3.8 0 0 0 .3-7.58A5.2 5.2 0 0 0 7.1 12.4 3.3 3.3 0 0 0 7.5 18Z"
            fill="currentColor"
            opacity="0.18"
          />
          <path
            d="M7.5 18h9.2a3.8 3.8 0 0 0 .3-7.58A5.2 5.2 0 0 0 7.1 12.4 3.3 3.3 0 0 0 7.5 18Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12 15.2V9.6M9.8 11.4 12 9.2l2.2 2.2"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

/** Rough client-side size estimate for preview (not exact download size). */
function estimateFileSize(
  format: RecordExportFormat,
  count: number,
  includeDetails: boolean,
): string {
  const n = Math.max(1, count);
  const detailMul = includeDetails ? 1 : 0.45;
  // Bytes per item by format — tuned to feel realistic for summary exports.
  const perItem =
    format === "excel" ? 2200 : format === "pdf" ? 4800 : 1600;
  const overhead = format === "excel" ? 12_000 : format === "pdf" ? 18_000 : 400;
  const bytes = Math.round(overhead + perItem * n * detailMul);

  if (bytes < 1024) return `~${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `~${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `~${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Format picker for exporting multiple selected projects / modules / bugs / test cases.
 */
export function BulkExportModal({
  open,
  entityPlural,
  entitySingular,
  selectedCount,
  detailsLabel,
  detailsHint,
  onClose,
  onExport,
}: {
  open: boolean;
  entityPlural: string;
  entitySingular: string;
  selectedCount: number;
  detailsLabel?: string;
  detailsHint?: string;
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

  if (!open || selectedCount < 1) return null;

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
        aria-labelledby="bulk-export-title"
        className="tb-card tb-modal-panel tb-xport tb-bulk-xport w-full max-w-2xl"
      >
        <div className="tb-xport-head">
          <div className="min-w-0">
            <h2 id="bulk-export-title" className="tb-xport-title">
              Export {entityPlural}
            </h2>
            <p className="tb-xport-sub">
              Export your selected {entitySingular}
              {selectedCount === 1 ? "" : "s"} in your preferred format.
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

        <div className="tb-bulk-xport-layout">
          <div className="min-w-0">
            <p className="tb-xport-section-label">What do you want to export?</p>
            <div className="tb-bulk-scope is-active">
              <span className="tb-bulk-scope-check" aria-hidden>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="m5 13 4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="tb-bulk-scope-title">Selected {entityPlural}</span>
                <span className="tb-bulk-scope-count">
                  {selectedCount} {entitySingular}
                  {selectedCount === 1 ? "" : "s"}
                </span>
              </span>
            </div>

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
                <span className="tb-xport-include-label">
                  {detailsLabel ?? `${entitySingular} details`}
                </span>
                <span className="tb-xport-include-hint">
                  {detailsHint ?? "Includes the full field list and related records for each item."}
                </span>
              </span>
            </label>
          </div>

          <aside className="tb-bulk-preview" aria-label="Export preview">
            <div className="tb-bulk-preview-head">
              <p className="tb-bulk-preview-title">Export Preview</p>
              <span className="tb-bulk-preview-live">Live Preview</span>
            </div>
            <ExportPreviewArt active={format} />
            <dl className="tb-bulk-preview-stats">
              <div>
                <dt>Total selected</dt>
                <dd>{selectedCount}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{format.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Details</dt>
                <dd>{includeDetails ? "Included" : "Summary only"}</dd>
              </div>
              <div>
                <dt>Estimated file size</dt>
                <dd>{estimateFileSize(format, selectedCount, includeDetails)}</dd>
              </div>
            </dl>
          </aside>
        </div>

        <div className="tb-xport-foot">
          <button type="button" className="tb-btn-ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="tb-btn-primary" disabled={busy} onClick={submit}>
            {busy ? "Exporting\u2026" : `Export ${selectedCount} ${entitySingular}${selectedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
