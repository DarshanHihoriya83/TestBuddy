export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Clamps `page` against the current item count and returns the slice bounds.
 * Callers keep the raw page in state; the clamp handles rows disappearing
 * underneath the viewer (a filter change, a deactivated user, a refetch).
 */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = items.length === 0 ? 0 : (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, items.length);
  return { totalPages, safePage, startIdx, endIdx, pageItems: items.slice(startIdx, endIdx) };
}

/** Page list with ellipsis gaps, so the control stays a fixed width. */
export function pageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}
