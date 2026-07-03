import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import TopBar from "../components/TopBar";
import { initials } from "../lib/constants";

export default function RecruitsAdminPage() {
  const navigate = useNavigate();
  const [recruits, setRecruits] = useState([]);
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

  async function deactivate(recruit) {
    await updateDoc(doc(db, "recruits", recruit.id), { isActive: false });
  }

  const filtered = recruits.filter((r) =>
    `${r.firstName} ${r.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app-shell">
      <TopBar title="Recruits" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <div className="field">
          <input type="text" placeholder="Search recruits" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 && <p className="muted">No recruits yet.</p>}

        {filtered.map((recruit) => (
          <div key={recruit.id} className="list-row">
            {recruit.photoURL ? (
              <img src={recruit.photoURL} className="avatar" alt="" />
            ) : (
              <div className="avatar">{initials(recruit.firstName, recruit.lastName)}</div>
            )}
            <div style={{ flex: 1 }} onClick={() => setEditing(recruit)}>
              <div style={{ fontWeight: 600 }}>{recruit.firstName} {recruit.lastName}</div>
              <div className="muted">{recruit.recruitClassOrCohort}</div>
            </div>
            <button
              className="secondary"
              style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
              onClick={() => deactivate(recruit)}
            >
              Deactivate
            </button>
          </div>
        ))}

        <button className="primary" style={{ marginTop: 16 }} onClick={() => setEditing({})}>
          + Add Recruit
        </button>
      </div>

      {editing && <RecruitFormModal recruit={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RecruitFormModal({ recruit, onClose }) {
  const isNew = !recruit.id;
  const [firstName, setFirstName] = useState(recruit.firstName ?? "");
  const [lastName, setLastName] = useState(recruit.lastName ?? "");
  const [cohort, setCohort] = useState(recruit.recruitClassOrCohort ?? "");
  const [badgeNumber, setBadgeNumber] = useState(recruit.badgeOrIdNumber ?? "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(recruit.photoURL ?? null);
  const [saving, setSaving] = useState(false);

  const canSave = firstName && lastName && cohort;

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
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
        const storageRef = ref(storage, `recruits/${recruitId}/photo-${Date.now()}`);
        await uploadBytes(storageRef, photoFile);
        const url = await getDownloadURL(storageRef);
        await updateDoc(doc(db, "recruits", recruitId), { photoURL: url });
      }

      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 320, background: "white" }} onClick={(e) => e.stopPropagation()}>
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
