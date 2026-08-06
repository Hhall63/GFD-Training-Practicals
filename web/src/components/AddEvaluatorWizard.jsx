import { useState } from "react";
import QRCode from "qrcode";
import { createEvaluatorInvite } from "../lib/evaluatorInvites";
import { sendEvaluatorInviteEmail } from "../lib/notify";

/** Creates an evaluator account with no temp password ever shown to anyone — the admin
 * only enters name/email and an optional same-day cutoff; the evaluator claims their
 * account by scanning a per-evaluator QR code (or opening the same link from the fallback
 * invite email) and setting their own password directly. See
 * docs/superpowers/specs/2026-08-06-evaluator-wizard-design.md. */
export default function AddEvaluatorWizard({ onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [autoDeactivate, setAutoDeactivate] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // null while filling out the form; { email, claimUrl, qrDataUrl, welcomeStatus } once
  // the account + invite exist — mirrors NewUserModal's `created` confirmation-view
  // pattern in AdminsPage.jsx.
  const [created, setCreated] = useState(null);

  const canSubmit = displayName && email;

  async function handleCreate() {
    setSubmitting(true);
    setError("");
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const { token } = await createEvaluatorInvite({ email: trimmedEmail, displayName, autoDeactivate });
      const claimUrl = `${window.location.origin}/claim/${token}`;
      const qrDataUrl = await QRCode.toDataURL(claimUrl);
      setCreated({ email: trimmedEmail, claimUrl, qrDataUrl, welcomeStatus: "sending" });
      const result = await sendEvaluatorInviteEmail({ toEmail: trimmedEmail, toName: displayName, claimUrl });
      setCreated((c) => ({ ...c, welcomeStatus: result.status }));
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "That email is already registered." : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      >
        <div className="card" style={{ width: 340, background: "white", textAlign: "center" }}>
          <h3 style={{ marginTop: 0 }}>Evaluator Invited</h3>
          <p style={{ margin: "0 0 8px" }}>{created.email}</p>
          <img src={created.qrDataUrl} alt="QR code to claim this evaluator account" style={{ width: 220, height: 220 }} />
          <p className="muted" style={{ marginTop: 8 }}>Have them scan this to set their password.</p>
          {created.welcomeStatus === "sending" && <p className="muted">Sending invite email…</p>}
          {created.welcomeStatus === "sent" && <p className="muted">Invite email sent to {created.email}.</p>}
          {(created.welcomeStatus === "not-configured" || created.welcomeStatus === "failed") && (
            <p className="muted">Invite email not sent — share this link manually: {created.claimUrl}</p>
          )}
          <button className="primary" style={{ marginTop: 12 }} disabled={created.welcomeStatus === "sending"} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 340, background: "white", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add Evaluator</h3>

        <div className="field">
          <label>Full Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={autoDeactivate}
              onChange={(e) => setAutoDeactivate(e.target.checked)}
              style={{ width: "auto", margin: 0 }}
            />
            Auto-deactivate at 6:00 PM
          </label>
          <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
            Deactivates automatically at 6:00 PM the day this account is created — or the
            next day, if created after 6:00 PM.
          </p>
        </div>

        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canSubmit || submitting} onClick={handleCreate}>
            {submitting ? "Creating…" : "Create & Generate QR"}
          </button>
        </div>
      </div>
    </div>
  );
}
