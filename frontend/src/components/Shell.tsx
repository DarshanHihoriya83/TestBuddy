import type { ReactNode } from "react";
import { TopNavBar } from "./AppNavigation";

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopNavBar title={title} />
      <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
