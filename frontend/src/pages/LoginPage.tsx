import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { login } from "../api";
import { useAuth } from "../auth";
import { TopNavBar } from "../components/AppNavigation";
import { validateEmail } from "../utils/validation";

export function LoginPage() {
  const { token, ready, setSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">
        Checking session…
      </div>
    );
  }
  if (token) return <Navigate to="/bugs" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      setBusy(false);
      return;
    }
    if (!password) {
      setError("Password is required");
      setBusy(false);
      return;
    }
    try {
      const result = await login(email.trim(), password);
      setSession(result.token, result.user);
      navigate("/bugs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNavBar title="Sign in" />
      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between bg-[var(--accent)] p-10 text-white lg:flex">
          <div>
            <p className="flex items-center gap-2 text-lg font-bold">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/20 text-sm">
                TB
              </span>
              TestBuddy
            </p>
            <h2 className="mt-12 text-3xl font-extrabold leading-tight">
              Welcome back.
              <br />
              Let&apos;s ship quality.
            </h2>
            <p className="mt-4 max-w-sm text-sm text-white/80">
              Sign in to review bugs, manage projects, and export test data from your dashboard.
            </p>
          </div>
          <p className="text-xs text-white/60">© TestBuddy</p>
        </div>

        <main className="grid flex-1 place-items-center bg-[var(--bg0)] p-6">
          <form onSubmit={onSubmit} className="tb-card w-full max-w-md p-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
              Sign in
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[var(--ink)]">Dashboard access</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Use your TestBuddy account credentials.
            </p>

            <label className="tb-label mt-6">
              Email
              <input
                className="tb-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="tb-label mt-4">
              Password
              <input
                className="tb-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error && <p className="tb-alert-error mt-4">{error}</p>}

            <button type="submit" disabled={busy} className="tb-btn-primary mt-6 w-full">
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="mt-4 text-sm text-[var(--muted)]">
              New here?{" "}
              <Link to="/register" className="font-semibold text-[var(--accent)] hover:underline">
                Create account
              </Link>
            </p>
            {import.meta.env.DEV && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Demo: <code>alice@testbuddy.local</code> / <code>password</code>
              </p>
            )}
          </form>
        </main>
      </div>
    </div>
  );
}
