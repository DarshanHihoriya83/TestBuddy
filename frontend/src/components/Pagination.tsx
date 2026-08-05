import { PAGE_SIZE_OPTIONS, pageNumbers } from "../utils/pagination";

export function Pagination({
  page,
  pageSize,
  totalItems,
  startIdx,
  endIdx,
  totalPages,
  itemLabel = "items",
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  startIdx: number;
  endIdx: number;
  totalPages: number;
  itemLabel?: string;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--bg0)] px-4 py-2.5">
      <p className="text-sm text-[var(--muted)]">
        {totalItems === 0
          ? `Showing 0 ${itemLabel}`
          : `Showing ${startIdx + 1} to ${endIdx} of ${totalItems} ${itemLabel}`}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="tb-page-btn"
          disabled={page <= 1}
          aria-label="Previous page"
          onClick={() => onPage(Math.max(1, page - 1))}
        >
          {"\u2039"}
        </button>
        {pageNumbers(page, totalPages).map((p, i) =>
          p === "ellipsis" ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-[var(--muted)]">
              {"\u2026"}
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`tb-page-btn ${p === page ? "tb-page-btn-active" : ""}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className="tb-page-btn"
          disabled={page >= totalPages}
          aria-label="Next page"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
        >
          {"\u203A"}
        </button>
      </div>

      <select
        className="tb-filter-select"
        value={pageSize}
        onChange={(e) => onPageSize(Number(e.target.value))}
        aria-label={`${itemLabel} per page`}
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} per page
          </option>
        ))}
      </select>
    </div>
  );
}
