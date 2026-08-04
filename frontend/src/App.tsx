import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth";
import { BugDetailPage } from "./pages/BugDetailPage";
import { BugsPage } from "./pages/BugsPage";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ModuleDetailPage } from "./pages/ModuleDetailPage";
import { ProjectEditPage } from "./pages/ProjectEditPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { UsersPage } from "./pages/UsersPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { NavDrawer, NavProvider } from "./components/AppNavigation";
import { canTransferRoles, isSuperAdmin } from "./utils/roles";
import { OrganizationsPage } from "./pages/OrganizationsPage";
import { OrganizationDetailPage } from "./pages/OrganizationDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof Error && /unauthorized/i.test(error.message)) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 15_000,
    },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { token, ready } = useAuth();
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">
        Checking session…
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireRoleTransfer({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">
        Checking session…
      </div>
    );
  }
  if (!canTransferRoles(user)) return <Navigate to="/projects" replace />;
  return children;
}

function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">
        Checking session…
      </div>
    );
  }
  if (!isSuperAdmin(user)) return <Navigate to="/projects" replace />;
  return children;
}

function AuthQueryBridge({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!token) qc.clear();
  }, [token, qc]);
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthQueryBridge>
          <BrowserRouter>
            <NavProvider>
              <NavDrawer />
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route
                  path="/organizations"
                  element={
                    <RequireAuth>
                      <RequireSuperAdmin>
                        <OrganizationsPage />
                      </RequireSuperAdmin>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/organizations/:id"
                  element={
                    <RequireAuth>
                      <RequireSuperAdmin>
                        <OrganizationDetailPage />
                      </RequireSuperAdmin>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/projects"
                  element={
                    <RequireAuth>
                      <ProjectsPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/projects/:id"
                  element={
                    <RequireAuth>
                      <ProjectDetailPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/projects/:id/modules/:moduleId"
                  element={
                    <RequireAuth>
                      <ModuleDetailPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/projects/:id/edit"
                  element={
                    <RequireAuth>
                      <ProjectEditPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/bugs"
                  element={
                    <RequireAuth>
                      <BugsPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/bugs/:id"
                  element={
                    <RequireAuth>
                      <BugDetailPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <RequireAuth>
                      <RequireRoleTransfer>
                        <UsersPage />
                      </RequireRoleTransfer>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <RequireAuth>
                      <SettingsPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <RequireAuth>
                      <ProfilePage />
                    </RequireAuth>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </NavProvider>
          </BrowserRouter>
        </AuthQueryBridge>
      </AuthProvider>
    </QueryClientProvider>
  );
}
