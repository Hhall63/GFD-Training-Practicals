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
  const [users, setUsers] = useState([]);
  const [showNewUser, setShowNewUser] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "admins"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  async function deactivate(user) {
    await updateDoc(doc(db, "admins", user.id), { isActive: false });
  }

  function toggleRole(user) {
    const nextRole = (user.role ?? "admin") === "admin" ? "evaluator" : "admin";
    updateDoc(doc(db, "admins", user.id), { role: nextRole });
  }

  return (
    <div className="app-shell">
      <TopBar title="Users" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        {users.map((user) => {
          const role = user.role ?? "admin";
          return (
            <div key={user.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {user.displayName}{" "}
                    <span className={`badge ${role === "admin" ? "pass" : "neutral"}`}>
                      {role === "admin" ? "Administrator" : "Evaluator"}
                    </span>
                  </div>
                  <div className="muted">{user.email}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "8px 12px" }}
                  onClick={() => toggleRole(user)}
                >
                  Make {role === "admin" ? "Evaluator" : "Administrator"}
                </button>
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "8px 12px" }}
                  onClick={() => requestPasswordReset(user.email)}
                >
                  Reset Password
                </button>
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
                  onClick={() => deactivate(user)}
                >
                  Deactivate
                </button>
              </div>
            </div>
          );
        })}

        <button className="primary" onClick={() => setShowNewUser(true)}>
          + Add User
        </button>
      </div>

      {showNewUser && <NewUserModal onClose={() => setShowNewUser(false)} />}
    </div>
  );
}

function NewUserModal({ onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("evaluator");
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
        role,
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
        <h3 style={{ marginTop: 0 }}>New User</h3>

        <div className="field">
          <label>Role</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["evaluator", "Evaluator"],
              ["admin", "Administrator"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: role === value ? "var(--brand-navy)" : "white",
                  color: role === value ? "white" : "var(--text)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            {role === "evaluator"
              ? "Can run tests and submit results. Cannot edit recruits, tests, or other users."
              : "Full access: can build tests, manage recruits, run reports, and manage users."}
          </p>
        </div>

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
