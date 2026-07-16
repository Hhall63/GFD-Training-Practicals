// web/src/lib/classReports.js
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

/** A saved query configuration, not a frozen snapshot — reopening a class report filter
 * re-runs it against current data, so a recruit's newer retake (or a test added to
 * templateIds after the fact) shows up correctly without needing to recreate the filter. */
export async function createClassReportFilter({ name, cohort, templateIds }) {
  const now = new Date();
  const ref = await addDoc(collection(db, "classReportFilters"), {
    name,
    cohort,
    templateIds,
    isActive: true,
    createdAt: now,
  });
  return { id: ref.id };
}

export async function deactivateClassReportFilter(filterId) {
  await updateDoc(doc(db, "classReportFilters", filterId), { isActive: false });
}
