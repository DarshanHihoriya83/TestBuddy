import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { fetchAdminUsers, fetchOrganizations, fetchProjects } from "../api";
import { useAuth } from "../auth";
import { PageHeader } from "../components/PageHeader";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import type { Organization, UserRole } from "../types";
import { roleLabel } from "../utils/roles";

type Tone = "blue" | "violet" | "green" | "amber";

const TONE_CLASS: Record<Tone, string> = {
  blue: "tb-bug-stat-icon-blue",
  violet: "tb-bug-stat-icon-violet",
  green: "tb-bug-stat-icon-green",
  amber: "tb-bug-stat-icon-amber",
};

function StatIcon({ name }: { name: "org" | "project" | "user" | "clock" }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "org":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="7" height="13" rx="1.5" />
          <rect x="14" y="3" width="7" height="17" rx="1.5" />
        </svg>
      );
    case "project":
      return (
        <svg {...common}>
          <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5 20c0-3 3.1-5.5 7-5.5s7 2.5 7 5.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
  }
}

function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
  to,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone: Tone;
  icon: "org" | "project" | "user" | "clock";
  to?: string;
}) {
  const body = (
    <div className="tb-bug-stat h-full">
      <span className={`tb-bug-stat-icon ${TONE_CLASS[tone]}`} aria-hidden>
        <StatIcon name={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <p className="text-xl font-extrabold leading-tight text-[var(--ink)]">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{hint}</p> : null}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function orgInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function usagePercent(org: Organization) {
  const limit = org.maxProjects ?? 0;
  if (!limit) return 0;
  return Math.min(100, Math.round(((org.projectCount ?? 0) / limit) * 100));
}

const ROLE_ORDER: UserRole[] = ["SUPERADMIN", "MANAGER", "DEVELOPER", "TESTER"];

function AttentionTile({
  count,
  label,
  action,
  to,
}: {
  count: number;
  label: string;
  action: string;
  to: string;
}) {
  const clear = count === 0;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-elevated)] p-3">
      <p
        className={`text-2xl font-extrabold leading-none ${
          clear ? "text-[var(--muted)]" : "text-[var(--ink)]"
        }`}
      >
        {count}
      </p>
      <p className="mt-1 text-xs leading-snug text-[var(--muted)]">{label}</p>
      {!clear && (
        <Link
          to={to}
          className="mt-2 inline-block text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          {action}
        </Link>
      )}
    </div>
  );
}

export function SuperAdminOverviewPage() {
  const { user } = useAuth();

  const orgsQuery = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: fetchOrganizations,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.usersAdmin(),
    queryFn: () => fetchAdminUsers(),
  });

  const orgs = orgsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const userStats = useMemo(() => {
    const byRole: Record<string, number> = {};
    let active = 0;
    let pending = 0;
    for (const u of users) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
      if (u.active !== false) active += 1;
      if (u.mustChangePassword) pending += 1;
    }
    return { byRole, active, inactive: users.length - active, pending };
  }, [users]);

  // Orgs closest to their project cap first — that is what needs a decision.
  const orgsByPressure = useMemo(
    () => [...orgs].sort((a, b) => usagePercent(b) - usagePercent(a)).slice(0, 5),
    [orgs],
  );

  const emptyOrgs = orgs.filter((o) => (o.projectCount ?? 0) === 0).length;
  const fullOrgs = orgs.filter((o) => usagePercent(o) >= 100).length;
  const loading = orgsQuery.isLoading || projectsQuery.isLoading || usersQuery.isLoading;

  return (
    <Shell title="Overview">
      <div className="space-y-4 pb-4">
        <PageHeader
          description={
            <>
              Platform overview for{" "}
              <strong className="text-[var(--ink)]">{user?.name ?? "SuperAdmin"}</strong> —
              organizations, projects, and people across every tenant.
            </>
          }
          actions={
            <>
              <Link to="/organizations" className="tb-btn-ghost text-sm">
                Manage organizations
              </Link>
              <Link to="/users" className="tb-btn-primary text-sm">
                Manage users
              </Link>
            </>
          }
        />

        <QueryStatus
          isLoading={loading}
          error={orgsQuery.error || projectsQuery.error || usersQuery.error}
          onRetry={() => {
            void orgsQuery.refetch();
            void projectsQuery.refetch();
            void usersQuery.refetch();
          }}
          loadingText="Loading platform overview…"
        />

        {!loading && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Organizations"
                value={orgs.length}
                hint={emptyOrgs ? `${emptyOrgs} with no projects` : "All have projects"}
                tone="blue"
                icon="org"
                to="/organizations"
              />
              <StatCard
                label="Projects"
                value={projects.length}
                hint={fullOrgs ? `${fullOrgs} org(s) at capacity` : "Capacity available"}
                tone="violet"
                icon="project"
              />
              <StatCard
                label="Users"
                value={users.length}
                hint={`${userStats.active} active · ${userStats.inactive} inactive`}
                tone="green"
                icon="user"
                to="/users"
              />
              <StatCard
                label="First-time logins"
                value={userStats.pending}
                hint="Temporary password not changed yet"
                tone="amber"
                icon="clock"
                to="/users"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <section className="tb-card overflow-hidden lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold text-[var(--ink)]">Project capacity</h2>
                    <p className="text-xs text-[var(--muted)]">
                      Organizations closest to their project limit
                    </p>
                  </div>
                  <Link to="/organizations" className="tb-btn-ghost text-xs">
                    View all
                  </Link>
                </div>

                {orgsByPressure.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                    No organizations yet. Create one to get started.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--line)]">
                    {orgsByPressure.map((org) => {
                      const percent = usagePercent(org);
                      return (
                        <li key={org.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="tb-org-avatar" aria-hidden>
                            {orgInitials(org.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/organizations/${org.id}`}
                              className="block truncate text-sm font-semibold text-[var(--accent)] hover:underline"
                            >
                              {org.name}
                            </Link>
                            <p className="text-xs text-[var(--muted)]">
                              {org.memberCount ?? 0} member(s)
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[var(--ink)]">
                              {org.projectCount ?? 0}
                              <span className="text-xs font-semibold text-[var(--muted)]">
                                /{org.maxProjects ?? "—"}
                              </span>
                            </span>
                            <span className="tb-usage-track" aria-hidden>
                              <span
                                className={`tb-usage-fill ${
                                  percent >= 100 ? "is-full" : percent >= 80 ? "is-high" : ""
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="tb-card overflow-hidden">
                <div className="border-b border-[var(--line)] px-4 py-3">
                  <h2 className="text-sm font-bold text-[var(--ink)]">People by designation</h2>
                  <p className="text-xs text-[var(--muted)]">Across all organizations</p>
                </div>
                <ul className="divide-y divide-[var(--line)]">
                  {ROLE_ORDER.map((role) => (
                    <li key={role} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm font-semibold text-[var(--ink)]">
                        {roleLabel(role)}
                      </span>
                      <span className="tb-count-pill">{userStats.byRole[role] ?? 0}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-[var(--line)] px-4 py-3">
                  <Link to="/users" className="tb-btn-ghost w-full justify-center text-xs">
                    Open user directory
                  </Link>
                </div>
              </section>
            </div>

            <section className="tb-card p-4">
              <h2 className="text-sm font-bold text-[var(--ink)]">Needs attention</h2>
              <p className="text-xs text-[var(--muted)]">
                Nothing here blocks anyone — these are the gaps worth a look.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <AttentionTile
                  count={fullOrgs}
                  label="organizations at their project limit"
                  action="Raise a limit"
                  to="/organizations"
                />
                <AttentionTile
                  count={emptyOrgs}
                  label="organizations without a project"
                  action="Add projects"
                  to="/organizations"
                />
                <AttentionTile
                  count={userStats.inactive}
                  label="deactivated users still on the platform"
                  action="Review users"
                  to="/users"
                />
              </div>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
