import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import badge from "../assets/gfd-badge.png";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

/**
 * Shown exactly once, the first time this app is ever opened on a brand-new (empty)
 * Firestore project — there's no server to seed an initial admin account from. This account
 * can then create every other admin's login afterward.
 */
export default function SetupAdminPage() {
  const { createFirstAdmin } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    displayName && email && password.length >= 6 && password === confirmPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      await createFirstAdmin({ uid: credential.user.uid, email, displayName });
      // AuthContext's onAuthStateChanged listener picks up the new session automatically.
    } catch (err) {
      setError(
        err.code === "auth/email-already-in-use"
          ? "That email is already registered."
          : "Something went wrong. Try again."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="screen center-column" style={{ paddingTop: 32 }}>
      <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
      <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>Welcome</h2>
      <p className="muted" style={{ maxWidth: 340 }}>
        Create the first administrator account for this department's app. This account can
        create everyone else's login afterward.
      </p>

      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 340, marginTop: 16 }}>
        <div className="field">
          <input
            type="text"
            placeholder="Your Name (e.g. Chief Alvarez)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
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
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
        <button className="primary" type="submit" disabled={!canSubmit || submitting}>
          {submitting ? "Creating…" : "Create Admin Account"}
        </button>
      </form>
    </div>
  );
}
