import badge from "../assets/gfd-badge.png";
import { useAuth } from "../context/AuthContext";

/** Shown when the app can't reach the database at all — instead of the first-run setup
 * screen, which is what a failed connection used to (confusingly) fall back to. */
export default function ConnectionErrorPage() {
  const { retryConnection } = useAuth();

  return (
    <div className="screen center-column" style={{ paddingTop: 48 }}>
      <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
      <div style={{ fontSize: 44 }}>⚠️</div>
      <h2 style={{ margin: "4px 0", color: "var(--brand-red)" }}>Error!</h2>
      <p style={{ fontWeight: 600, marginTop: 0 }}>Can't reach the server.</p>

      <div className="card" style={{ textAlign: "left", maxWidth: 360, width: "100%" }}>
        <strong>Try the following:</strong>
        <ol style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Check that this device has an internet connection (Wi‑Fi or cellular).</li>
          <li>If you're on a station or public network, it may block the connection — try switching to cellular data.</li>
          <li>Turn Airplane Mode on and back off, then tap Try Again.</li>
          <li>Fully close the app (swipe it away in the app switcher) and reopen it.</li>
          <li>If it still fails, the service may be down — contact your administrator.</li>
        </ol>
      </div>

      <button className="primary" style={{ maxWidth: 240 }} onClick={retryConnection}>
        Try Again
      </button>
    </div>
  );
}
