import { Link, useLocation } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useAuth } from "../auth";

const NAV = [
  { to: "/", label: "Home", match: (path: string) => path === "/" },
  {
    to: "/projects",
    label: "Projects",
    match: (path: string) => path.startsWith("/projects"),
  },
  {
    to: "/bugs",
    label: "Bugs",
    match: (path: string) => path.startsWith("/bugs"),
  },
  {
    to: "/profile",
    label: "Profile",
    match: (path: string) => path.startsWith("/profile"),
  },
] as const;

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const initials =
    user?.name
      ?.split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <div className="min-h-screen lg:flex">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--line)] bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-semibold"
        >
          Menu
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold tracking-tight">TestBuddy</p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{title}</p>
        </div>
        <Link to="/profile" className="text-xs text-[var(--muted)]">
          {user?.name?.split(" ")[0]}
        </Link>
      </div>

      {/* Overlay */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Left sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--line)] bg-[#f4f7f5] transition-transform lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-[var(--line)] px-5 py-5">
          <Link to="/" className="block" onClick={() => setOpen(false)}>
            <p className="text-xl font-semibold tracking-tight text-[var(--ink)]">TestBuddy</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              QA workspace
            </p>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Navigate
          </p>
          {NAV.map((item) => {
            const active = item.match(location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--ink)] hover:bg-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--line)] p-4">
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white"
          >
            <div
              className="grid h-10 w-10 place-items-center rounded-xl text-sm font-semibold text-white"
              style={{ background: "linear-gradient(145deg, #0f6e56, #1a5f7a)" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs text-[var(--muted)]">{user?.role}</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1">
        <header className="hidden border-b border-[var(--line)] bg-white/70 px-8 py-5 backdrop-blur lg:block">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">TestBuddy</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
