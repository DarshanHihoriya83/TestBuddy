import { Link, useLocation } from "react-router-dom";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth";
import { canTransferRoles, isSuperAdmin, roleLabel } from "../utils/roles";

const NAV_DRAWER_ID = "testbuddy-nav-drawer";

type NavItem = { to: string; label: string; match: (path: string) => boolean; icon: ReactNode };

const BASE_NAV: Omit<NavItem, "icon">[] = [
  { to: "/", label: "Home", match: (path: string) => path === "/" },
  { to: "/projects", label: "Projects", match: (path: string) => path.startsWith("/projects") },
  { to: "/bugs", label: "Bugs", match: (path: string) => path.startsWith("/bugs") },
  {
    to: "/settings",
    label: "Settings",
    match: (path: string) => path.startsWith("/settings") || path.startsWith("/profile"),
  },
];

function NavIcon({ name }: { name: string }) {
  const cls = "h-[22px] w-[22px] shrink-0";
  switch (name) {
    case "Home":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        </svg>
      );
    case "Projects":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        </svg>
      );
    case "Bugs":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3v3M8 6l-2-2M16 6l2-2M6 12H3M21 12h-3M8 18l-2 2M16 18l2 2M12 21v-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    case "Users":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
          <path d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M16 11h5M18.5 8.5v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "Organizations":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="7" width="7" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
          <rect x="14" y="3" width="7" height="17" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
          <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
  }
}

function buildNavItems(user: ReturnType<typeof useAuth>["user"]): NavItem[] {
  const items: NavItem[] = BASE_NAV.filter(
    (item) =>
      !(isSuperAdmin(user) && (item.to === "/bugs" || item.to === "/projects")),
  ).map((item) => ({
    ...item,
    icon: <NavIcon name={item.label} />,
  }));
  if (isSuperAdmin(user)) {
    items.splice(1, 0, {
      to: "/organizations",
      label: "Organizations",
      match: (path: string) => path.startsWith("/organizations"),
      icon: <NavIcon name="Organizations" />,
    });
  }
  if (canTransferRoles(user)) {
    const settingsIdx = items.findIndex((i) => i.to === "/settings");
    items.splice(settingsIdx >= 0 ? settingsIdx : items.length, 0, {
      to: "/users",
      label: "Users",
      match: (path: string) => path.startsWith("/users"),
      icon: <NavIcon name="Users" />,
    });
  }
  return items;
}

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

  const navItems = useMemo(() => buildNavItems(user), [user]);

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
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-[var(--line)] bg-white shadow-xl transition-transform duration-200 ease-out lg:hidden ${
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
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--ink)] hover:bg-[var(--bg0)]"
                }`}
              >
                {item.icon}
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

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-[var(--muted)]">
      <path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navItems = useMemo(() => buildNavItems(user), [user]);
  const [expanded, setExpanded] = useState(false);

  const initials =
    user?.name
      ?.split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <aside
      className={`tb-sidebar ${expanded ? "is-expanded" : ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="flex h-16 items-center justify-center border-b border-[var(--line)] px-2">
        <Link
          to="/"
          className={`flex min-w-0 items-center ${
            expanded ? "w-full gap-2.5 px-1" : "justify-center"
          }`}
          title="TestBuddy"
        >
          <div className="tb-sidebar-accent h-10 w-10 text-xs">
            TB
          </div>
          <div className="tb-sidebar-label min-w-0 leading-tight">
            <p className="truncate text-sm font-bold tracking-tight text-[var(--ink)]">TestBuddy</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
              QA workspace
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2 py-4">
        <p className="tb-sidebar-menu-title px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          Menu
        </p>
        {navItems.map((item) => {
          const active = item.match(location.pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={`tb-sidebar-link flex items-center py-2.5 text-sm font-medium ${
                expanded ? "gap-3 px-2.5" : "justify-center px-0"
              } ${active ? "is-active" : "text-[var(--ink)]"}`}
            >
              <span className="tb-sidebar-icon">{item.icon}</span>
              <span className="tb-sidebar-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--line)] p-2">
        {user ? (
          <>
            <Link
              to="/profile"
              title={user.name}
              className={`tb-sidebar-link flex items-center py-2 ${
                expanded ? "gap-3 px-2" : "justify-center px-0"
              }`}
            >
              <div className="tb-sidebar-accent h-10 w-10 text-sm">
                {initials}
              </div>
              <div className="tb-sidebar-label min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{user.name}</p>
                <p className="truncate text-xs text-[var(--muted)]">{roleLabel(user.role)}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className={`mt-2 flex items-center rounded-xl text-sm ${
                expanded
                  ? "tb-btn-ghost w-full gap-3"
                  : "mx-auto grid h-10 w-10 place-items-center text-[var(--muted)] hover:bg-[var(--bg0)] hover:text-[var(--ink)]"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
                <path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="tb-sidebar-label">Sign out</span>
            </button>
          </>
        ) : (
          <Link
            to="/login"
            title="Sign in"
            className="tb-btn-primary flex w-full items-center justify-center text-sm"
          >
            {expanded ? "Sign in" : "→"}
          </Link>
        )}
      </div>
    </aside>
  );
}

export function PageBreadcrumb({ title }: { title: string }) {
  return (
    <div className="tb-breadcrumb-bar">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-[var(--muted)]">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 transition hover:bg-[var(--bg0)] hover:text-[var(--ink)]"
          title="Home"
        >
          <HomeIcon />
          <span className="hidden sm:inline">Home</span>
        </Link>
        <span aria-hidden className="text-[var(--line)]">
          /
        </span>
        <span className="truncate font-semibold text-[var(--accent)]">{title}</span>
      </nav>
    </div>
  );
}
