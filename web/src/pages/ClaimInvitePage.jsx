import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db, claimEvaluatorInvite } from "../firebase";
import badge from "../assets/gfd-badge.png";

/** Public, no-login page reached by scanning the QR (or opening the fallback invite email
 * link) AddEvaluatorWizard.jsx generates. Shows the invited email, collects the
 * evaluator's own new password, and claims the account. See
 * docs/superpowers/specs/2026-08-06-evaluator-wizard-design.md. */
export default function ClaimInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState("loading"); // loading | invalid | ready | claiming | done
  const [invite, setInvite] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getDoc(doc(db, "evaluatorInvites", token))
      .then((snap) => {
        if (!snap.exists() || snap.data().used || snap.data().expiresAt.toDate() < new Date()) {
          setPhase("invalid");
          return;
        }
        setInvite(snap.data());
        setPhase("ready");
      })
      .catch(() => setPhase("invalid"));
  }, [token]);

  async function handleClaim() {
    setPhase("claiming");
    setError("");
    try {
      await claimEvaluatorInvite(token, newPassword);
      setPhase("done");
    } catch (err) {
      if (err.code === "invite/partial-claim") {
        // The password is already set even though this specific attempt threw — same
        // outcome as full success from the evaluator's point of view.
        setPhase("done");
        return;
      }
      setPhase("ready");
      setError(
        err.code === "invite/used" || err.code === "invite/expired" || err.code === "invite/not-found"
          ? "This invite has expired or already been used. Ask your administrator for a new one."
          : "Something went wrong. Try again."
      );
    }
  }

  if (phase === "loading") {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading invite…</div>;
  }

  if (phase === "invalid") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
        <p className="muted" style={{ maxWidth: 320, textAlign: "center" }}>
          This invite has expired or already been used. Ask your administrator for a new one.
        </p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
        <p className="muted" style={{ maxWidth: 320, textAlign: "center", marginBottom: 16 }}>
          Password set — sign in with your new password.
        </p>
        <button className="primary" style={{ maxWidth: 280 }} onClick={() => navigate("/login", { replace: true })}>
          Continue to Login
        </button>
      </div>
    );
  }

  return (
    <div className="screen center-column" style={{ paddingTop: 32 }}>
      <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
      <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>Set Your Password</h2>
      <p className="muted" style={{ maxWidth: 320, textAlign: "center" }}>{invite.email}</p>

      <div style={{ width: "100%", maxWidth: 320, marginTop: 16 }}>
        <div className="field">
          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="6+ characters"
          />
        </div>
        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
        <button
          className="primary"
          style={{ width: "100%", marginTop: 8 }}
          disabled={newPassword.length < 6 || phase === "claiming"}
          onClick={handleClaim}
        >
          {phase === "claiming" ? "Setting Password…" : "Set Password & Continue"}
        </button>
      </div>
    </div>
  );
}
