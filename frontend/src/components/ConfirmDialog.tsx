import { useEffect } from "react";

/**
 * Professional confirm dialog — replaces window.confirm.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--line)] bg-[var(--panel-elevated)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            Please confirm
          </p>
          <h2 id="confirm-dialog-title" className="mt-1 text-lg font-bold text-[var(--ink)]">
            {title}
          </h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-[var(--muted)]">{message}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] bg-slate-50 px-5 py-3">
          <button
            type="button"
            className="tb-btn-ghost text-sm"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              danger
                ? "rounded-lg border border-red-200 bg-[var(--danger)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                : "tb-btn-primary text-sm"
            }
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
