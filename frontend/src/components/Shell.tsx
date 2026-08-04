import type { ReactNode } from "react";
import { AppSidebar, PageBreadcrumb } from "./AppNavigation";

export function Shell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-5 py-3">
          <PageBreadcrumb title={title} />
          {actions ? (
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
