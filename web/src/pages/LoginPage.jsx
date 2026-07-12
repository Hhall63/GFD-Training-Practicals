import { useEffect, useState } from "react";
import badge from "../assets/gfd-badge.png";
import { useAuth, IDLE_LOGOUT_FLAG } from "../context/AuthContext";

function AlertIcon({ variant }) {
  if (variant === "success") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8.2l2 2L11 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // error / info: warning triangle
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <path d="M8 1.5l6.5 11.5H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v3.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
    </svg>
  );
}

function FormAlert({ variant, role = "alert", children }) {
  return (
    <div className={`form-alert form-alert--${variant}`} role={role}>
      <AlertIcon variant={variant} />
      <span>{children}</span>
    </div>
  );
}

export default function LoginPage() {
  const { login, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="login-screen">
      <img src={badge} alt="Greensboro Fire Department badge" className="login-badge" />
      <h1 className="login-title">GFD Recruit Testing</h1>
      <div className="login-accent" aria-hidden="true" />
      <p className="login-subtitle">Greensboro Fire Department</p>

      <div className="card card--raised login-card">
        {idleLogout && (
          <FormAlert variant="info" role="status">
            You were signed out due to inactivity. Please sign in again.
          </FormAlert>
        )}
        {error && (
          <FormAlert variant="error">Incorrect email or password.</FormAlert>
        )}
        {resetSent && (
          <FormAlert variant="success" role="status">
            Password reset email sent — check your inbox (and your spam folder).
          </FormAlert>
        )}
        {resetError && <FormAlert variant="error">{resetError}</FormAlert>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-password">
              Password
            </label>
            <div className="password-field">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

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
          <p className="login-hint" style={{ marginTop: 8, marginBottom: 0 }}>
            Enter your email above, then tap Forgot Password to get a reset link.
          </p>
        </form>
      </div>

      <p className="login-hint" style={{ marginTop: 28, maxWidth: 340, textAlign: "center" }}>
        Accounts are created by a department administrator. Contact your admin if you need
        access.
      </p>
    </div>
  );
}
