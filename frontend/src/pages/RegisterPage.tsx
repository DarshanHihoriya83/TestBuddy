import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { register } from "../api";
import { useAuth } from "../auth";

const inputClass =
  "mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm";
const labelClass =
  "mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";

export function RegisterPage() {
  const { token, setSession } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("TESTER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/bugs" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const result = await register({ name: name.trim(), email: email.trim(), password, role });
      setSession(result.token, result.user);
      navigate("/bugs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Register to file bugs and manage test cases.
        </p>

        <label className={labelClass}>
          Full name
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            autoComplete="name"
          />
        </label>
        <label className={labelClass}>
          Email
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label className={labelClass}>
          Role
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="TESTER">Tester</option>
            <option value="DEVELOPER">Developer</option>
            <option value="MANAGER">Manager</option>
          </select>
        </label>
        <label className={labelClass}>
          Password
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label className={labelClass}>
          Confirm password
          <input
            className={inputClass}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
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
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
