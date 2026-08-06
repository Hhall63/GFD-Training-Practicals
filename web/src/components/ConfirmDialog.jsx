import { useState } from "react";
import Modal from "./Modal";

/** Generic destructive-action confirmation, built on the shared Modal shell (focus trap,
 * Escape-to-close, backdrop-click-to-close, focus restoration — see Modal.jsx). Every
 * deactivate/delete/remove action in the admin app routes through this instead of firing
 * immediately — see docs/superpowers/specs/2026-08-05-confirm-dialogs-design.md. */
export default function ConfirmDialog({ titleId, title, message, confirmLabel, onConfirm, onCancel }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      // No setPending(false) here on success: the caller's onConfirm clears the
      // pending-state that's rendering this component at all, which unmounts it.
    } catch {
      setError("Something went wrong. Try again.");
      setPending(false);
    }
  }

  return (
    <Modal titleId={titleId} onClose={onCancel}>
      <h3 id={titleId} style={{ marginTop: 0 }}>
        {title}
      </h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {message}
      </p>
      {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button className="primary danger" disabled={pending} onClick={handleConfirm}>
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
