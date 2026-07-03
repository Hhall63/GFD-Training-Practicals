import { useState } from "react";
import badge from "../assets/gfd-badge.png";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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
    try {
      await requestPasswordReset(email);
      setResetSent(true);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="screen center-column" style={{ paddingTop: 48 }}>
      <img src={badge} alt="GFD Badge" style={{ width: 140, marginBottom: 16 }} />
      <h2 style={{ margin: "0 0 4px" }}>GFD Recruit Testing</h2>
      <p className="muted" style={{ marginTop: 0 }}>Greensboro Fire Department</p>

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
            Password reset email sent — check your inbox.
          </p>
        )}
        <button className="primary" type="submit" disabled={!email || !password || submitting}>
          {submitting ? "Signing In…" : "Sign In"}
        </button>
        <button
          type="button"
          className="secondary"
          style={{ marginTop: 10 }}
          onClick={handleForgotPassword}
          disabled={!email}
        >
          Forgot Password?
        </button>
      </form>

      <p className="muted" style={{ marginTop: 32, maxWidth: 320 }}>
        Accounts are created by a department administrator. Contact your admin if you need
        access.
      </p>
    </div>
  );
}
