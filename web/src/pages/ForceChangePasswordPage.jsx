import badge from "../assets/gfd-badge.png";
import { useAuth } from "../context/AuthContext";
import ChangePasswordForm from "../components/ChangePasswordForm";

/** Rendered by App.jsx's RequireAuth in place of any route whenever adminDoc.mustChangePassword
 * is true — blocks every screen until the account holder sets a new password. There is no
 * Cancel button (ChangePasswordForm hides it when onCancel is omitted); Sign Out is the only
 * escape hatch, so someone who isn't ready isn't trapped. */
export default function ForceChangePasswordPage() {
  const { logout } = useAuth();

  return (
    <div className="screen center-column" style={{ paddingTop: 32 }}>
      <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
      <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>Set a New Password</h2>
      <p className="muted" style={{ maxWidth: 340 }}>
        You need to set a new password before continuing.
      </p>

      <div style={{ width: "100%", maxWidth: 340, marginTop: 16 }}>
        <ChangePasswordForm onSuccess={() => {}} />
        <button className="secondary" style={{ marginTop: 10 }} onClick={logout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
