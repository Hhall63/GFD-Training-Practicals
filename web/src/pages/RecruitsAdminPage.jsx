import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, createUserAccountWithoutSigningIn } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { initials } from "../lib/constants";
import { compressImageToDataUrl } from "../lib/image";
import { PRACTICE_RECRUIT_ID } from "../lib/practiceRecruit";

/**
 * The one place a recruit gets created: roster info (name, cohort, badge, photo) and an
 * optional portal login, all in a single form. There is deliberately no other path to add
 * a recruit — Users management only creates Administrator/Evaluator accounts, and a
 * recruit login always references a recruit record created here, never the other way
 * around, so there's no way to end up with a "user" who isn't on the testing roster.
 */
export default function RecruitsAdminPage() {
  const navigate = useNavigate();
  const { requestPasswordReset } = useAuth();
  const [recruits, setRecruits] = useState([]);
  const [recruitLogins, setRecruitLogins] = useState([]); // admins with role === "recruit"
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing existing
  const [search, setSearch] = useState("");

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

  useEffect(() => {
    const q = query(collection(db, "admins"), where("role", "==", "recruit"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setRecruitLogins(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const loginByRecruitId = useMemo(() => {
    const map = {};
    for (const login of recruitLogins) map[login.recruitId] = login;
    return map;
  }, [recruitLogins]);

  async function deactivate(recruit) {
    await updateDoc(doc(db, "recruits", recruit.id), { isActive: false });
  }

  // The practice recruit is system-managed (seeded/kept alive by the test picker, see
  // src/lib/practiceRecruit.js) — it's not a real trainee, so it has no place in the roster
  // an administrator edits or deactivates here.
  const filtered = recruits
    .filter((r) => !r.isPractice && r.id !== PRACTICE_RECRUIT_ID)
    .filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="app-shell">
      <TopBar title="Recruits" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen--wide">
        <div className="field">
          <input type="text" placeholder="Search recruits" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <button
          type="button"
          className="secondary"
          style={{ width: "auto", padding: "8px 12px", marginBottom: 12 }}
          onClick={() => navigate("/recruits/deactivated")}
        >
          View Deactivated
        </button>

        {filtered.length === 0 && <p className="muted">No recruits yet.</p>}

        <div className="recruit-grid">
          {filtered.map((recruit) => {
            const login = loginByRecruitId[recruit.id];
            return (
              <div key={recruit.id} className="card card--raised">
                <button
                  type="button"
                  className="recruit-tile"
                  style={{ background: "none", border: "none", padding: 0 }}
                  onClick={() => setEditing(recruit)}
                >
                  {recruit.photoURL ? (
                    <img src={recruit.photoURL} className="avatar" alt="" />
                  ) : (
                    <div className="avatar">{initials(recruit.firstName, recruit.lastName)}</div>
                  )}
                  <div className="recruit-tile-name" style={{ fontWeight: 600 }}>
                    {recruit.firstName} {recruit.lastName}
                  </div>
                  <div className="muted recruit-tile-cohort">{recruit.recruitClassOrCohort}</div>
                  <div className="muted recruit-tile-cohort">{login ? `Portal login: ${login.email}` : "No portal login"}</div>
                </button>
                <button
                  type="button"
                  className="secondary"
                  style={{ width: "100%", marginTop: 10, padding: "12px 12px", color: "var(--brand-red)" }}
                  onClick={() => deactivate(recruit)}
                >
                  Deactivate
                </button>
              </div>
            );
          })}
        </div>

        <button className="primary" style={{ marginTop: 16 }} onClick={() => setEditing({})}>
          + Add Recruit
        </button>
      </div>

      {editing && (
        <RecruitFormModal
          recruit={editing}
          existingLogin={loginByRecruitId[editing.id]}
          onClose={() => setEditing(null)}
          requestPasswordReset={requestPasswordReset}
        />
      )}
    </div>
  );
}

function RecruitFormModal({ recruit, existingLogin, onClose, requestPasswordReset }) {
  const isNew = !recruit.id;
  const [firstName, setFirstName] = useState(recruit.firstName ?? "");
  const [lastName, setLastName] = useState(recruit.lastName ?? "");
  const [cohort, setCohort] = useState(recruit.recruitClassOrCohort ?? "");
  const [badgeNumber, setBadgeNumber] = useState(recruit.badgeOrIdNumber ?? "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(recruit.photoURL ?? null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const wantsNewLogin = !existingLogin && (loginEmail || loginPassword);
  const canSave =
    firstName && lastName && cohort && (!wantsNewLogin || (loginEmail && loginPassword.length >= 6));

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const data = {
        firstName,
        lastName,
        recruitClassOrCohort: cohort,
        badgeOrIdNumber: badgeNumber || null,
        isActive: true,
      };

      let recruitId = recruit.id;
      if (isNew) {
        data.createdAt = new Date();
        const created = await addDoc(collection(db, "recruits"), data);
        recruitId = created.id;
      } else {
        await updateDoc(doc(db, "recruits", recruitId), data);
      }

      if (photoFile) {
        const dataUrl = await compressImageToDataUrl(photoFile);
        await updateDoc(doc(db, "recruits", recruitId), { photoURL: dataUrl });
      }

      if (wantsNewLogin) {
        const uid = await createUserAccountWithoutSigningIn(loginEmail.trim().toLowerCase(), loginPassword);
        await setDoc(doc(db, "admins", uid), {
          email: loginEmail.trim().toLowerCase(),
          displayName: `${firstName} ${lastName}`,
          role: "recruit",
          recruitId,
          isActive: true,
          createdAt: new Date(),
        });
      }

      onClose();
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "That email is already registered." : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveLogin() {
    await updateDoc(doc(db, "admins", existingLogin.id), { isActive: false });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 340, background: "white", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{isNew ? "New Recruit" : "Edit Recruit"}</h3>

        <div className="center-column" style={{ marginBottom: 12 }}>
          <label style={{ cursor: "pointer" }}>
            <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />
            {photoPreview ? (
              <img src={photoPreview} alt="" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div className="avatar" style={{ width: 80, height: 80 }}>📷</div>
            )}
          </label>
        </div>

        <div className="field">
          <input type="text" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="field">
          <input type="text" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="field">
          <input type="text" placeholder="Class / Cohort" value={cohort} onChange={(e) => setCohort(e.target.value)} />
        </div>
        <div className="field">
          <input type="text" placeholder="Badge / ID (optional)" value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} />
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "8px 0 14px" }} />

        {existingLogin ? (
          <div className="field">
            <label>Portal Login</label>
            <p style={{ margin: "0 0 8px" }}>{existingLogin.email}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="secondary"
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => requestPasswordReset(existingLogin.email)}
              >
                Reset Password
              </button>
              <button
                type="button"
                className="secondary"
                style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
                onClick={handleRemoveLogin}
              >
                Remove Login
              </button>
            </div>
          </div>
        ) : (
          <div className="field">
            <label>Portal Login (optional)</label>
            <p className="muted" style={{ marginTop: 0 }}>
              Lets this recruit sign in and check their own test status. Leave blank to skip.
            </p>
            <input type="email" placeholder="Email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
            <input type="password" placeholder="Temporary Password (6+ characters)" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
          </div>
        )}

        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
