// Reads/writes the safe, non-sensitive test-bank reference on an exam's template doc. Never
// touches question text/answers — see the design doc's Security section for what "safe"
// means here.
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

// Fisher-Yates. bQuestionIds is Version B's fixed, reproducible question order — computed
// once per save, not recomputed on every "Generate Version B" click, so reprinting a lost
// paper later reproduces the exact same order (docs/superpowers/specs/2026-08-01-test-bank-ab-versions-design.md).
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function saveTestBankReference(examId, { bankFileName, questionIds, pointsById }) {
  const ref = doc(db, "templates", examId);
  const existing = (await getDoc(ref)).data()?.testBank;
  const now = Timestamp.now();
  const testBank = {
    bankFileName,
    questionIds,
    bQuestionIds: shuffle(questionIds),
    pointsById,
    importedAt: existing?.importedAt ?? now,
    lastBuiltAt: now,
  };
  await updateDoc(ref, { testBank });
  return testBank;
}

export async function loadTestBankReference(examId) {
  const snap = await getDoc(doc(db, "templates", examId));
  return snap.data()?.testBank ?? null;
}
