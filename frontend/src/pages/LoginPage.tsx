import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { login } from "../api";
import { useAuth } from "../auth";

export function LoginPage() {
  const { token, setSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("alice@testbuddy.local");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/bugs" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password);
      setSession(result.token, result.user);
      navigate("/bugs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-8 shadow-sm"
      >
        <p className="text-sm font-semibold tracking-[0.18em] uppercase text-[var(--accent)]">
          TestBuddy
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Review bugs filed from the extension.
        </p>

        <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Email
          <input
            className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Password
          <input
            className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-sm text-[var(--muted)]">
          New to TestBuddy?{" "}
          <Link to="/register" className="font-semibold text-[var(--accent)] hover:underline">
            Create an account
          </Link>
        </p>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Demo users share password <code>password</code> (e.g. alice@testbuddy.local).
          Need the extension?{" "}
          <a className="text-[var(--accent)] underline" href="/">
            Download it from Home
          </a>
          .
        </p>
      </form>
    </main>
  );
}
