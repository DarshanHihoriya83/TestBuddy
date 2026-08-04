import { Link, useLocation } from "react-router-dom";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth";
import { canTransferRoles, isSuperAdmin, roleLabel } from "../utils/roles";

const NAV_DRAWER_ID = "testbuddy-nav-drawer";

const BASE_NAV = [
  { to: "/", label: "Home", match: (path: string) => path === "/" },
  { to: "/projects", label: "Projects", match: (path: string) => path.startsWith("/projects") },
  { to: "/bugs", label: "Bugs", match: (path: string) => path.startsWith("/bugs") },
  {
    to: "/settings",
    label: "Settings",
    match: (path: string) => path.startsWith("/settings") || path.startsWith("/profile"),
  },
] as const;

type NavContextValue = {
  navOpen: boolean;
  toggleNav: () => void;
  closeNav: () => void;
};

const NavContext = createContext<NavContextValue | null>(null);

function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}

export function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <span className="relative mx-auto block h-[14px] w-[18px]" aria-hidden>
      <span
        className={`absolute left-0 block h-[2px] w-full rounded-full bg-current transition-all duration-200 ${
          open ? "top-[6px] rotate-45" : "top-0"
        }`}
      />
      <span
        className={`absolute left-0 top-[6px] block h-[2px] w-full rounded-full bg-current transition-all duration-200 ${
          open ? "opacity-0" : "opacity-100"
        }`}
      />
      <span
        className={`absolute left-0 block h-[2px] w-full rounded-full bg-current transition-all duration-200 ${
          open ? "top-[6px] -rotate-45" : "top-[12px]"
        }`}
      />
    </span>
  );
}

function LogoMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-xs font-bold text-white">
        TB
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-bold tracking-tight text-[var(--ink)]">TestBuddy</p>
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
          QA workspace
        </p>
      </div>
    </div>
  );
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    if (navOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  const value: NavContextValue = {
    navOpen,
    toggleNav: () => setNavOpen((v) => !v),
    closeNav: () => setNavOpen(false),
  };

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function NavDrawer() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { navOpen, closeNav } = useNav();

  const navItems = useMemo(() => {
    const items: { to: string; label: string; match: (path: string) => boolean }[] = [
      ...BASE_NAV,
    ];
    // After Home — SuperAdmin only
    if (isSuperAdmin(user)) {
      items.splice(1, 0, {
        to: "/organizations",
        label: "Organizations",
        match: (path: string) => path.startsWith("/organizations"),
      });
    }
    // Before Settings — role-transfer roles
    if (canTransferRoles(user)) {
      const settingsIdx = items.findIndex((i) => i.to === "/settings");
      items.splice(settingsIdx >= 0 ? settingsIdx : items.length, 0, {
        to: "/users",
        label: "Users",
        match: (path: string) => path.startsWith("/users"),
      });
    }
    return items;
  }, [user]);

  const initials =
    user?.name
      ?.split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <>
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-900/25"
          onClick={closeNav}
        />
      )}

      <aside
        id={NAV_DRAWER_ID}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-[var(--line)] bg-white shadow-xl transition-transform duration-200 ease-out ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between gap-3 border-b border-[var(--line)] px-4">
          <Link to="/" onClick={closeNav} className="min-w-0">
            <LogoMark />
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeNav}
            className="tb-btn-icon"
          >
            <HamburgerIcon open />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            Menu
          </p>
          {navItems.map((item) => {
            const active = item.match(location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={closeNav}
                className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--ink)] hover:bg-[var(--bg0)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--line)] p-4">
          {user ? (
            <>
              <Link
                to="/profile"
                onClick={closeNav}
                className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--bg0)]"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-sm font-bold text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{user.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{roleLabel(user.role)}</p>
                </div>
              </Link>
              <button type="button" onClick={logout} className="tb-btn-ghost mt-3 w-full text-sm">
                Sign out
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <Link
                to="/login"
                onClick={closeNav}
                className="tb-btn-primary block w-full text-center text-sm"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                onClick={closeNav}
                className="tb-btn-ghost block w-full text-center text-sm"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export function TopNavBar({ title }: { title: string }) {
  const { user } = useAuth();
  const { navOpen, toggleNav } = useNav();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--line)] bg-white/95 px-4 backdrop-blur sm:gap-4 sm:px-6">
      <button
        type="button"
        aria-label={navOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={navOpen}
        aria-controls={NAV_DRAWER_ID}
        onClick={toggleNav}
        className="tb-btn-icon"
      >
        <HamburgerIcon open={navOpen} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <p className="truncate text-sm font-bold text-[var(--ink)] sm:text-base">TestBuddy</p>
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
          {title}
        </p>
      </div>

      <Link
        to={user ? "/profile" : "/login"}
        className="inline-flex h-10 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg0)]"
      >
        {user ? user.name?.split(" ")[0] : "Sign in"}
      </Link>
    </header>
  );
}
