import type { ReactNode } from "react";
import { AppSidebar, PageBreadcrumb, type BreadcrumbItem } from "./AppNavigation";

export function Shell({
  title,
  crumbs,
  actions,
  children,
}: {
  title: string;
  crumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-5 py-3">
          <PageBreadcrumb title={title} crumbs={crumbs} />
          {actions ? (
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
          ) : null}
          <div className="tb-scroll-y flex min-h-0 flex-1 flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
}
