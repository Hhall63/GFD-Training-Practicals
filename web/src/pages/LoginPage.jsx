import { useEffect, useState } from "react";
import badge from "../assets/gfd-badge.png";
import { useAuth, IDLE_LOGOUT_FLAG } from "../context/AuthContext";

export default function LoginPage() {
  const { login, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);
  // Show a one-time notice if we arrived here from an inactivity auto-logout. The flag
  // read/clear is a side effect, so it lives in an effect (not a useState initializer,
  // which must stay pure).
  const [idleLogout, setIdleLogout] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(IDLE_LOGOUT_FLAG)) {
        setIdleLogout(true);
        sessionStorage.removeItem(IDLE_LOGOUT_FLAG);
      }
    } catch {
      // sessionStorage may be unavailable; the notice is a nicety, so ignore.
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(false);
    try {
      await login(email, password);
    } catch {
      setError(true);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) return;
    setResetting(true);
    setResetError("");
    setResetSent(false);
    setError(false);
    try {
      await requestPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      const code = err?.code;
      setResetError(
        code === "auth/user-not-found"
          ? "No account found for that email."
          : code === "auth/invalid-email"
          ? "Enter a valid email address."
          : code === "auth/too-many-requests"
          ? "Too many attempts. Wait a moment and try again."
          : "Couldn't send the reset email. Try again."
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="screen center-column" style={{ paddingTop: 48 }}>
      <img src={badge} alt="GFD Badge" style={{ width: 140, marginBottom: 16 }} />
      <h2 style={{ margin: "0 0 4px" }}>GFD Recruit Testing</h2>
      <p className="muted" style={{ marginTop: 0 }}>Greensboro Fire Department</p>

      {idleLogout && (
        <p className="muted" style={{ marginTop: 16, maxWidth: 320, textAlign: "center" }}>
          You were signed out due to inactivity. Please sign in again.
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 340, marginTop: 24 }}>
        <div className="field">
          <input
            type="email"
            placeholder="Email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p style={{ color: "var(--brand-red)", fontSize: 13 }}>
            Incorrect email or password.
          </p>
        )}
        {resetSent && (
          <p style={{ color: "var(--success)", fontSize: 13 }}>
            Password reset email sent — check your inbox (and your spam folder).
          </p>
        )}
        {resetError && (
          <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{resetError}</p>
        )}
        <button className="primary" type="submit" disabled={!email || !password || submitting}>
          {submitting ? "Signing In…" : "Sign In"}
        </button>
        <button
          type="button"
          className="secondary"
          style={{ marginTop: 10 }}
          onClick={handleForgotPassword}
          disabled={!email || resetting}
        >
          {resetting ? "Sending…" : "Forgot Password?"}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
          Enter your email above, then tap Forgot Password to get a reset link.
        </p>
      </form>

      <p className="muted" style={{ marginTop: 32, maxWidth: 320 }}>
        Accounts are created by a department administrator. Contact your admin if you need
        access.
      </p>
    </div>
  );
}
