import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { createUserAccountWithoutSigningIn } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";

const ROLE_FILTERS = [
  ["all", "All"],
  ["admin", "Admins"],
  ["evaluator", "Evaluators"],
  ["recruit", "Recruits"],
];

const ROLE_LABELS = { admin: "Administrator", evaluator: "Evaluator", recruit: "Recruit" };

export default function AdminsPage() {
  const navigate = useNavigate();
  const { requestPasswordReset, adminDoc } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [recruits, setRecruits] = useState([]);
  const [showNewUser, setShowNewUser] = useState(searchParams.get("new") === "1");
  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    const q = query(collection(db, "admins"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "recruits"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setRecruits(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    });
  }, []);

  const filteredUsers = useMemo(() => {
    if (roleFilter === "all") return users;
    return users.filter((u) => (u.role ?? "admin") === roleFilter);
  }, [users, roleFilter]);

  const recruitName = (recruitId) => {
    const r = recruits.find((x) => x.id === recruitId);
    return r ? `${r.firstName} ${r.lastName}` : "(recruit record missing)";
  };

  async function deactivate(user) {
    await updateDoc(doc(db, "admins", user.id), { isActive: false });
  }

  function toggleStaffRole(user) {
    const nextRole = (user.role ?? "admin") === "admin" ? "evaluator" : "admin";
    updateDoc(doc(db, "admins", user.id), { role: nextRole });
  }

  function toggleNotify(user) {
    updateDoc(doc(db, "admins", user.id), { notifyOnFailures: !user.notifyOnFailures });
  }

  function closeNewUserModal() {
    setShowNewUser(false);
    if (searchParams.get("new")) {
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }

  return (
    <div className="app-shell">
      <TopBar title="Users" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {ROLE_FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRoleFilter(value)}
              style={{
                flex: 1,
                padding: "8px 4px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: roleFilter === value ? "var(--brand-navy)" : "white",
                color: roleFilter === value ? "white" : "var(--text)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {filteredUsers.length === 0 && <p className="muted">No users match this filter.</p>}

        {filteredUsers.map((user) => {
          const role = user.role ?? "admin";
          const isSelf = user.id === adminDoc?.id;
          return (
            <div key={user.id} className="card">
              <div style={{ fontWeight: 600 }}>
                {user.displayName}{" "}
                <span className={`badge ${role === "admin" ? "pass" : "neutral"}`}>{ROLE_LABELS[role]}</span>
              </div>
              <div className="muted">{user.email}</div>
              {role === "recruit" && (
                <div className="muted">Linked to recruit: {recruitName(user.recruitId)}</div>
              )}

              {role === "admin" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text)", margin: "10px 0 0" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(user.notifyOnFailures)}
                    onChange={() => toggleNotify(user)}
                    style={{ width: "auto", margin: 0 }}
                  />
                  Notify with failures (email when a recruit fails a test)
                </label>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {role !== "recruit" && (
                  <button
                    className="secondary"
                    style={{ width: "auto", padding: "8px 12px" }}
                    onClick={() => toggleStaffRole(user)}
                  >
                    Make {role === "admin" ? "Evaluator" : "Administrator"}
                  </button>
                )}
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "8px 12px" }}
                  onClick={() => requestPasswordReset(user.email)}
                >
                  Reset Password
                </button>
                {!isSelf && (
                  <button
                    className="secondary"
                    style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
                    onClick={() => deactivate(user)}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <button className="primary" onClick={() => setShowNewUser(true)}>
          + Add User
        </button>
      </div>

      {showNewUser && <NewUserModal recruits={recruits} users={users} onClose={closeNewUserModal} />}
    </div>
  );
}

function NewUserModal({ recruits, users, onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("evaluator");
  const [notifyOnFailures, setNotifyOnFailures] = useState(false);
  const [recruitId, setRecruitId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Recruits that don't already have a login.
  const linkedIds = new Set(users.filter((u) => u.recruitId).map((u) => u.recruitId));
  const unlinkedRecruits = recruits.filter((r) => !linkedIds.has(r.id));

  const canSubmit =
    displayName && email && password.length >= 6 && (role !== "recruit" || recruitId);

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
        notifyOnFailures: role === "admin" ? notifyOnFailures : false,
        recruitId: role === "recruit" ? recruitId : null,
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
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 340, background: "white", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>New User</h3>

        <div className="field">
          <label>Role</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["evaluator", "Evaluator"],
              ["admin", "Admin"],
              ["recruit", "Recruit"],
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
            {role === "evaluator" && "Can run tests and submit results. Cannot edit recruits, tests, or other users."}
            {role === "admin" && "Full access: can build tests, manage recruits, run reports, and manage users."}
            {role === "recruit" && "Sees only their own list of published tests with pass/fail status. Cannot run or edit anything."}
          </p>
        </div>

        {role === "recruit" && (
          <div className="field">
            <label>Which recruit is this login for?</label>
            <select value={recruitId} onChange={(e) => setRecruitId(e.target.value)}>
              <option value="">Select a recruit…</option>
              {unlinkedRecruits.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.lastName}, {r.firstName} — {r.recruitClassOrCohort}
                </option>
              ))}
            </select>
            {unlinkedRecruits.length === 0 && (
              <p className="muted" style={{ marginTop: 4 }}>
                Every recruit already has a login (or none exist yet — add recruits under
                Manage Recruits first).
              </p>
            )}
          </div>
        )}

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

        {role === "admin" && (
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
              <input
                type="checkbox"
                checked={notifyOnFailures}
                onChange={(e) => setNotifyOnFailures(e.target.checked)}
                style={{ width: "auto", margin: 0 }}
              />
              Notify with failures
            </label>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Email this admin whenever a recruit fails a test.
            </p>
          </div>
        )}

        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canSubmit || submitting} onClick={handleCreate}>
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
