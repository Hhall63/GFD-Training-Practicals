import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import { initials } from "../lib/constants";
import { PRACTICE_RECRUIT_ID } from "../lib/practiceRecruit";

export default function DeactivatedRecruitsPage() {
  const navigate = useNavigate();
  const [recruits, setRecruits] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "recruits"), where("isActive", "==", false));
    return onSnapshot(q, (snap) => {
      setRecruits(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => !r.isPractice && r.id !== PRACTICE_RECRUIT_ID)
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    });
  }, []);

  async function reactivate(recruit) {
    await updateDoc(doc(db, "recruits", recruit.id), { isActive: true });
  }

  return (
    <div className="app-shell">
      <TopBar title="Deactivated Recruits" onBack={() => navigate("/recruits")} showMenu={false} />
      <div className="screen--wide">
        {recruits.length === 0 && <p className="muted">No deactivated recruits.</p>}

        <div className="recruit-grid">
          {recruits.map((recruit) => (
            <div key={recruit.id} className="card card--raised">
              {recruit.photoURL ? (
                <img src={recruit.photoURL} className="avatar" alt="" />
              ) : (
                <div className="avatar">{initials(recruit.firstName, recruit.lastName)}</div>
              )}
              <div className="recruit-tile-name" style={{ fontWeight: 600 }}>
                {recruit.firstName} {recruit.lastName}
              </div>
              <div className="muted recruit-tile-cohort">{recruit.recruitClassOrCohort}</div>
              <button
                type="button"
                className="secondary"
                style={{ width: "100%", marginTop: 10, padding: "12px 12px" }}
                onClick={() => reactivate(recruit)}
              >
                Reactivate
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
