import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { register } from "../api";
import { useAuth } from "../auth";
import { TopNavBar } from "../components/AppNavigation";
import { validateEmail, validateName } from "../utils/validation";

export function RegisterPage() {
  const { token, ready, setSession } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    setError(null);

    const nameErr = validateName(name);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
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
      const result = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        role: "TESTER",
      });
      setSession(result.token, result.user);
      navigate("/bugs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNavBar title="Register" />
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
              Join your team.
              <br />
              Start capturing bugs.
            </h2>
            <p className="mt-4 max-w-sm text-sm text-white/80">
              Free account for testers and developers. Record browser sessions and manage bugs from
              one dashboard.
            </p>
          </div>
          <p className="text-xs text-white/60">© TestBuddy</p>
        </div>

        <main className="grid flex-1 place-items-center bg-[var(--bg0)] p-6">
          <form onSubmit={onSubmit} className="tb-card w-full max-w-md p-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
              Register
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[var(--ink)]">Create account</h1>

            <label className="tb-label mt-6">
              Full name
              <input
                className="tb-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </label>
            <label className="tb-label mt-4">
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
                minLength={8}
              />
            </label>
            <label className="tb-label mt-4">
              Confirm password
              <input
                className="tb-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>

            {error && <p className="tb-alert-error mt-4">{error}</p>}

            <button type="submit" disabled={busy} className="tb-btn-primary mt-6 w-full">
              {busy ? "Creating…" : "Create account"}
            </button>
            <p className="mt-4 text-sm text-[var(--muted)]">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-[var(--accent)] hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}
