import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import {
  authenticateDrive,
  connectDrive,
  getStoredDriveHandle,
  listBankFiles,
  readBankFile,
  readOverrides,
} from "../lib/testBankDrive";
import { applyOverrides, parseLxrBank } from "../lib/lxrbankParser";
import { loadTestBankReference } from "../lib/testBankExam";
import TestBankBuilder from "../components/TestBankBuilder";

export default function TestBankPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [dirHandle, setDirHandle] = useState(null);
  const [driveStatus, setDriveStatus] = useState("checking"); // checking | disconnected | unauthorized | authorized
  const [bankFiles, setBankFiles] = useState([]);
  const [bankData, setBankData] = useState(null); // { fileName, baseQuestions, overrides }
  const [loadingBank, setLoadingBank] = useState(false);
  const [error, setError] = useState(null);

  const [savedReference, setSavedReference] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "templates", examId)).then((snap) => {
      setExam(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    loadTestBankReference(examId).then(setSavedReference);
  }, [examId]);

  useEffect(() => {
    (async () => {
      const handle = await getStoredDriveHandle();
      if (!handle) {
        setDriveStatus("disconnected");
        return;
      }
      await authorizeAndList(handle);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function authorizeAndList(handle) {
    setDirHandle(handle);
    const ok = await authenticateDrive(handle);
    if (!ok) {
      setDriveStatus("unauthorized");
      return;
    }
    setDriveStatus("authorized");
    setBankFiles(await listBankFiles(handle));
  }

  async function handleConnect() {
    setError(null);
    try {
      const handle = await connectDrive();
      await authorizeAndList(handle);
    } catch (err) {
      if (err?.name !== "AbortError") setError("Could not access the drive: " + err.message);
    }
  }

  async function handleSelectBank(fileName) {
    setLoadingBank(true);
    setError(null);
    try {
      const buffer = await readBankFile(dirHandle, fileName);
      const overrides = await readOverrides(dirHandle, fileName);
      const { questions } = await parseLxrBank(buffer);
      setBankData({ fileName, baseQuestions: questions, overrides });
    } catch (err) {
      setError("Could not read that bank file: " + err.message);
    } finally {
      setLoadingBank(false);
    }
  }

  const questions = useMemo(
    () => (bankData ? applyOverrides(bankData.baseQuestions, bankData.overrides) : []),
    [bankData]
  );

  return (
    <div className="app-shell">
      <TopBar title="Build from Test Bank" subtitle={exam?.name} onBack={() => navigate("/exams")} showMenu={false} />
      <div className={bankData ? "screen--wide screen--textured" : "screen screen--textured"}>
        {error && (
          <p className="muted" style={{ color: "var(--brand-red)" }}>
            {error}
          </p>
        )}

        {driveStatus === "checking" && <p className="muted">Checking for a connected drive…</p>}

        {driveStatus === "disconnected" && (
          <div className="card">
            <p className="muted">
              Connect the authorized test bank drive to browse and build exams from its
              question banks.
            </p>
            <button className="primary" onClick={handleConnect}>
              Connect Drive
            </button>
          </div>
        )}

        {driveStatus === "unauthorized" && (
          <div className="card">
            <p className="muted" style={{ color: "var(--brand-red)" }}>
              This drive is not authorized for the test bank.
            </p>
            <button className="secondary" onClick={handleConnect}>
              Try a Different Drive
            </button>
          </div>
        )}

        {driveStatus === "authorized" && !bankData && (
          <div className="card">
            {savedReference && !bankFiles.includes(savedReference.bankFileName) && (
              <p className="muted" style={{ color: "var(--brand-red)" }}>
                This exam was previously built from "{savedReference.bankFileName}", which
                isn't on this drive. Connect the drive that has it to regenerate, or pick a
                different bank below to start over.
              </p>
            )}
            <p className="muted">
              {bankFiles.length === 0
                ? "No .LXRBank files found on this drive."
                : "Select a bank to browse or build from:"}
            </p>
            {bankFiles.map((fileName) => (
              <button
                key={fileName}
                className="list-row list-row--hoverable"
                style={{ width: "100%", textAlign: "left", justifyContent: "space-between" }}
                disabled={loadingBank}
                onClick={() => handleSelectBank(fileName)}
              >
                <span style={{ fontWeight: 600 }}>{fileName}</span>
                {savedReference?.bankFileName === fileName && (
                  <span className="badge neutral" style={{ flexShrink: 0 }}>
                    Previously used
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {bankData && (
          <TestBankBuilder
            examId={examId}
            examName={exam?.name ?? ""}
            dirHandle={dirHandle}
            bankFileName={bankData.fileName}
            questions={questions}
            overrides={bankData.overrides}
            savedReference={savedReference?.bankFileName === bankData.fileName ? savedReference : null}
            onOverridesSaved={(newOverrides) => setBankData((prev) => ({ ...prev, overrides: newOverrides }))}
            onSaved={setSavedReference}
          />
        )}
      </div>
    </div>
  );
}
