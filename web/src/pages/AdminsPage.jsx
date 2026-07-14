import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { createUserAccountWithoutSigningIn } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { sendWelcomeEmail } from "../lib/notify";

// This page only ever manages staff (Administrator/Evaluator) accounts. Recruit accounts
// are created and managed from Manage Recruits instead, alongside the recruit's roster
// record and photo — see RecruitsAdminPage.jsx.
const ROLE_FILTERS = [
  ["all", "All"],
  ["admin", "Admins"],
  ["evaluator", "Evaluators"],
];

const ROLE_LABELS = { admin: "Administrator", evaluator: "Evaluator" };

export default function AdminsPage() {
  const navigate = useNavigate();
  const { requestPasswordReset, adminDoc } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [showNewUser, setShowNewUser] = useState(searchParams.get("new") === "1");
  const [roleFilter, setRoleFilter] = useState("all");
  const [resetMsgByUser, setResetMsgByUser] = useState({});

  useEffect(() => {
    const q = query(collection(db, "admins"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      // Recruit-role accounts live here too (same collection), but this page never shows
      // or creates them.
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => (u.role ?? "admin") !== "recruit"));
    });
  }, []);

  const filteredUsers = useMemo(() => {
    if (roleFilter === "all") return users;
    return users.filter((u) => (u.role ?? "admin") === roleFilter);
  }, [users, roleFilter]);

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

  // Previously fire-and-forget (no await, no feedback); now confirms success or surfaces
  // a failure so an admin knows whether the reset email actually went out.
  async function handleReset(user) {
    setResetMsgByUser((m) => ({ ...m, [user.id]: { text: "Sending…", ok: null } }));
    try {
      await requestPasswordReset(user.email);
      setResetMsgByUser((m) => ({ ...m, [user.id]: { text: `Reset email sent to ${user.email}.`, ok: true } }));
    } catch {
      setResetMsgByUser((m) => ({ ...m, [user.id]: { text: "Couldn't send the reset email. Try again.", ok: false } }));
    }
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
        <p className="muted">
          Administrators and Evaluators only. To create a recruit's login, use Manage
          Recruits instead.
        </p>
        <div className="segmented" style={{ marginBottom: 16 }}>
          {ROLE_FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`segment${roleFilter === value ? " active" : ""}`}
              onClick={() => setRoleFilter(value)}
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
              <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>
                {user.displayName}{" "}
                <span className={`badge ${role === "admin" ? "pass" : "neutral"}`}>{ROLE_LABELS[role]}</span>
              </div>
              <div className="muted">{user.email}</div>

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

              {role === "admin" && user.notifyOnFailures && <NotifyEmailEditor user={user} />}

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "8px 12px" }}
                  onClick={() => toggleStaffRole(user)}
                >
                  Make {role === "admin" ? "Evaluator" : "Administrator"}
                </button>
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "8px 12px" }}
                  onClick={() => handleReset(user)}
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
              {resetMsgByUser[user.id] && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: resetMsgByUser[user.id].ok === false ? "var(--brand-red)" : "var(--success)",
                  }}
                >
                  {resetMsgByUser[user.id].text}
                </div>
              )}
            </div>
          );
        })}

        <button className="primary" onClick={() => setShowNewUser(true)}>
          + Add User
        </button>
      </div>

      {showNewUser && <NewUserModal onClose={closeNewUserModal} />}
    </div>
  );
}

/** Lets an admin route their failure-notification emails to a different address (e.g. a
 * work inbox) than the one they log in with, without changing their login. Empty = fall
 * back to the login email. */
function NotifyEmailEditor({ user }) {
  const [value, setValue] = useState(user.notificationEmail ?? "");
  const [status, setStatus] = useState(null); // null | "saving" | "saved"

  const trimmed = value.trim().toLowerCase();
  const current = user.notificationEmail ?? "";
  const dirty = trimmed !== current;

  async function save() {
    setStatus("saving");
    await updateDoc(doc(db, "admins", user.id), { notificationEmail: trimmed || null });
    setStatus("saved");
  }

  return (
    <div className="field" style={{ margin: "10px 0 0" }}>
      <label style={{ fontSize: 13 }}>Send failure emails to</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="email"
          placeholder={user.email}
          autoCapitalize="none"
          autoCorrect="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus(null);
          }}
          style={{ marginBottom: 0 }}
        />
        <button
          className="secondary"
          style={{ width: "auto", padding: "8px 12px" }}
          disabled={!dirty || status === "saving"}
          onClick={save}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
        {status === "saved"
          ? "Saved."
          : `Leave blank to use the login email (${user.email}).`}
      </p>
    </div>
  );
}

function NewUserModal({ onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("evaluator");
  const [notifyOnFailures, setNotifyOnFailures] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // null while filling out the form; { email, password, welcomeStatus } once the account
  // exists — the modal switches to a confirmation view so the admin can see whether the
  // welcome email went out, and if not, still has the temp password on screen to relay.
  const [created, setCreated] = useState(null);

  const canSubmit = displayName && email && password.length >= 6;

  async function handleCreate() {
    setSubmitting(true);
    setError("");
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const uid = await createUserAccountWithoutSigningIn(trimmedEmail, password);
      await setDoc(doc(db, "admins", uid), {
        email: trimmedEmail,
        displayName,
        role,
        isActive: true,
        notifyOnFailures: role === "admin" ? notifyOnFailures : false,
        createdAt: new Date(),
        mustChangePassword: true,
      });
      setCreated({ email: trimmedEmail, password, welcomeStatus: "sending" });
      const result = await sendWelcomeEmail({
        toEmail: trimmedEmail,
        toName: displayName,
        loginEmail: trimmedEmail,
        tempPassword: password,
      });
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
        <div className="card" style={{ width: 340, background: "white" }}>
          <h3 style={{ marginTop: 0 }}>User Created</h3>
          <p style={{ margin: "0 0 8px" }}>{created.email}</p>
          {created.welcomeStatus === "sending" && <p className="muted">Sending welcome email…</p>}
          {created.welcomeStatus === "sent" && <p className="muted">Welcome email sent to {created.email}.</p>}
          {(created.welcomeStatus === "not-configured" || created.welcomeStatus === "failed") && (
            <p className="muted">
              Welcome email not sent — share the login email and temporary password (
              <strong>{created.password}</strong>) with them manually.
            </p>
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
        <h3 style={{ marginTop: 0 }}>New User</h3>

        <div className="field">
          <label>Role</label>
          <div className="segmented">
            {[
              ["evaluator", "Evaluator"],
              ["admin", "Admin"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`segment${role === value ? " active" : ""}`}
                onClick={() => setRole(value)}
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
