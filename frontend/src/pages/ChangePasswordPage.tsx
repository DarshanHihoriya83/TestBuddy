import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { updateProfile } from "../api";
import { useAuth } from "../auth";
import { FlashAlert } from "../components/FlashAlert";
import {
  IconLock,
  IconRefresh,
  PasswordField,
  PasswordStrengthMeter,
  UserAccessFlowStepper,
} from "../components/users/UserPasswordUi";
import { isSuperAdmin } from "../utils/roles";
import { validatePasswordStrength } from "../utils/validation";

export function ChangePasswordPage() {
  const { token, user, ready, setSession, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(
    () => ({ name: user?.name, email: user?.email }),
    [user?.name, user?.email],
  );

  const strengthError = validatePasswordStrength(newPassword, context);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const sameAsTemporary = newPassword.length > 0 && newPassword === currentPassword;
  const canSubmit =
    currentPassword.length > 0 && !strengthError && !mismatch && !sameAsTemporary && !busy;

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">
        Checking session…
      </div>
    );
  }
  if (!token || !user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) {
    return <Navigate to={isSuperAdmin(user) ? "/organizations" : "/bugs"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!currentPassword) {
      setError("Enter your temporary password");
      return;
    }
    if (strengthError) {
      setError(strengthError);
      return;
    }
    if (sameAsTemporary) {
      setError("New password must be different from the temporary one");
      return;
    }
    if (mismatch || !confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile({
        name: user!.name.trim() || "User",
        currentPassword,
        newPassword,
      });
      // The old token was revoked server-side; adopt the reissued one.
      if (updated.token) setSession(updated.token, updated);
      else updateUser(updated);
      navigate(isSuperAdmin(updated) ? "/organizations" : "/bugs", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg0)]">
      <div className="mx-auto grid w-full max-w-4xl flex-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <form onSubmit={onSubmit} noValidate className="tb-card overflow-hidden p-0 shadow-lg">
          <div className="border-b border-[var(--line)] bg-gradient-to-r from-[var(--accent-soft)] to-white px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[var(--accent)] shadow-sm">
                <IconLock className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
                  Security
                </p>
                <h1 className="mt-1 text-2xl font-bold text-[var(--ink)]">Change your password</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  You signed in with a temporary password. Set a new one to access TestBuddy.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <PasswordField
              label="Temporary password"
              required
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              error={touched && !currentPassword ? "Enter your temporary password" : null}
              hint="The one your admin shared with you"
            />
            <PasswordField
              label="New password"
              required
              icon={<IconRefresh />}
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              error={
                sameAsTemporary
                  ? "New password must be different from the temporary one"
                  : touched && strengthError
                    ? strengthError
                    : null
              }
            />
            <PasswordField
              label="Confirm new password"
              required
              icon={<IconRefresh />}
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              error={mismatch ? "New passwords do not match" : null}
            />

            <PasswordStrengthMeter password={newPassword} context={context} />

            <FlashAlert error={error} message={null} className="" />

            <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-4 sm:flex-row">
              <button type="submit" disabled={!canSubmit} className="tb-btn-primary flex-1">
                {busy ? "Saving…" : "Save and continue"}
              </button>
              <button type="button" className="tb-btn-ghost flex-1 text-sm" onClick={() => logout()}>
                Sign out
              </button>
            </div>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <UserAccessFlowStepper activeStep={3} />
          <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--ink)]">
            <strong className="text-[var(--accent)]">Almost there.</strong> After you save, your
            temporary password stops working and every other session is signed out.
          </div>
        </aside>
      </div>
    </div>
  );
}
