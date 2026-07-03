import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { createUserAccountWithoutSigningIn } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";

export default function AdminsPage() {
  const navigate = useNavigate();
  const { requestPasswordReset } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [showNewAdmin, setShowNewAdmin] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "admins"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  async function deactivate(admin) {
    await updateDoc(doc(db, "admins", admin.id), { isActive: false });
  }

  return (
    <div className="app-shell">
      <TopBar title="Administrators" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        {admins.map((admin) => (
          <div key={admin.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{admin.displayName}</div>
                <div className="muted">{admin.email}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "8px 12px" }}
                  onClick={() => requestPasswordReset(admin.email)}
                >
                  Reset Password
                </button>
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
                  onClick={() => deactivate(admin)}
                >
                  Deactivate
                </button>
              </div>
            </div>
          </div>
        ))}

        <button className="primary" onClick={() => setShowNewAdmin(true)}>
          + Add Administrator
        </button>
      </div>

      {showNewAdmin && <NewAdminModal onClose={() => setShowNewAdmin(false)} />}
    </div>
  );
}

function NewAdminModal({ onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    setSubmitting(true);
    setError("");
    try {
      const uid = await createUserAccountWithoutSigningIn(email.trim().toLowerCase(), password);
      await setDoc(doc(db, "admins", uid), {
        email: email.trim().toLowerCase(),
        displayName,
        isActive: true,
        createdAt: new Date(),
      });
      onClose();
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "That email is already registered." : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 320, background: "white" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>New Administrator</h3>
        <div className="field">
          <label>Full Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Temporary Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!displayName || !email || password.length < 6 || submitting}
            onClick={handleCreate}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
