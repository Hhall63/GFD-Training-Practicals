import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import FormAlert from "./FormAlert";

function mapError(err) {
  const code = err?.code;
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
    return "Current password is incorrect.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (code === "auth/weak-password") {
    return "Choose a password with at least 6 characters.";
  }
  return "Something went wrong. Try again.";
}

/** Shared by the voluntary "Change Password" dropdown modal (TopBar.jsx) and the mandatory
 * first-login gate (ForceChangePasswordPage.jsx) — pass onCancel to show a Cancel button,
 * omit it to hide one (the forced gate has no way to skip). */
export default function ChangePasswordForm({ onSuccess, onCancel }) {
  const { changeOwnPassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const validationError =
    newPassword.length > 0 && newPassword.length < 6
      ? "New password must be at least 6 characters."
      : newPassword && currentPassword && newPassword === currentPassword
      ? "New password must be different from your current password."
      : confirmPassword && confirmPassword !== newPassword
      ? "Passwords don't match."
      : "";

  const canSubmit =
    currentPassword && newPassword.length >= 6 && confirmPassword === newPassword && newPassword !== currentPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await changeOwnPassword(currentPassword, newPassword);
      onSuccess();
    } catch (err) {
      setError(mapError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <FormAlert variant="error">{error}</FormAlert>}
      <div className="field">
        <label htmlFor="change-pw-current">Current Password</label>
        <input
          id="change-pw-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="change-pw-new">New Password</label>
        <input
          id="change-pw-new"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="change-pw-confirm">Confirm New Password</label>
        <input
          id="change-pw-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {validationError && !error && (
        <p style={{ color: "var(--brand-red)", fontSize: 13, margin: "0 0 12px" }}>{validationError}</p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
        <button className="primary" type="submit" disabled={!canSubmit || submitting}>
          {submitting ? "Changing…" : "Change Password"}
        </button>
      </div>
    </form>
  );
}
