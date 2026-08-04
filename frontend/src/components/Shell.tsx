import type { ReactNode } from "react";
import { TopNavBar } from "./AppNavigation";

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
    <div className="min-h-screen">
      <TopNavBar title={title} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {actions ? (
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{actions}</div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
