import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Fixed doc id for the built-in "practice recruit" — a real `recruits` doc (not a special
 * case elsewhere) so every existing recruit-list query, the test picker, and the session
 * flow all just work against it unmodified. Fixed id (rather than a normal auto-id) keeps
 * ensurePracticeRecruit() idempotent: repeated calls target the same doc instead of
 * creating duplicates.
 */
export const PRACTICE_RECRUIT_ID = "__practice__";

/**
 * Ensures the practice recruit doc exists, without ever clobbering fields an admin may have
 * hand-edited (e.g. a future custom photo) or duplicating the doc. Safe to call on every
 * mount of the test picker — `merge: true` makes repeated calls a no-op once the doc exists.
 *
 * Only administrators can write `recruits/*` per firestore.rules, so when an evaluator is
 * the first to open the test picker after a fresh deploy, this call is expected to fail
 * with permission-denied; callers should swallow that rather than surface it, since the
 * doc will simply get created the next time an administrator opens the picker (or the
 * Manage Recruits page) instead.
 */
export async function ensurePracticeRecruit() {
  await setDoc(
    doc(db, "recruits", PRACTICE_RECRUIT_ID),
    {
      isPractice: true,
      isActive: true,
      firstName: "Test",
      lastName: "Recruit",
      recruitClassOrCohort: "Practice",
    },
    { merge: true }
  );
}
