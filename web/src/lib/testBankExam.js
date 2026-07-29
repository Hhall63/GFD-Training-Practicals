// Reads/writes the safe, non-sensitive test-bank reference on an exam's template doc. Never
// touches question text/answers — see the design doc's Security section for what "safe"
// means here.
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

export async function saveTestBankReference(examId, { bankFileName, questionIds, pointsById }) {
  const ref = doc(db, "templates", examId);
  const existing = (await getDoc(ref)).data()?.testBank;
  const now = Timestamp.now();
  const testBank = {
    bankFileName,
    questionIds,
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
