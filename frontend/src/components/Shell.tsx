import type { ReactNode } from "react";
import { AppSidebar, PageBreadcrumb, type BreadcrumbItem } from "./AppNavigation";

export function Shell({
  title,
  crumbs,
  crumbRoot,
  hideBreadcrumb,
  actions,
  children,
}: {
  title: string;
  crumbs?: BreadcrumbItem[];
  crumbRoot?: BreadcrumbItem;
  hideBreadcrumb?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-5 py-3">
          {hideBreadcrumb ? null : (
            <PageBreadcrumb title={title} crumbs={crumbs} root={crumbRoot} />
          )}
          {actions ? (
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          ) : null}
          {/* The negative margin lets the scrollbar ride inside main's right
              padding, so the track clears the cards instead of hugging them
              while the content edge still lines up with the breadcrumb. */}
          <div className="tb-scroll-y -mr-4 flex min-h-0 flex-1 flex-col pr-2">{children}</div>
        </main>
      </div>
    </div>
  );
}
