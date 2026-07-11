import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Fixed doc id for the built-in "practice recruit" — a real `recruits` doc (not a special
 * case elsewhere) so every existing recruit-list query, the test picker, and the session
 * flow all just work against it unmodified. Fixed id (rather than a normal auto-id) keeps
 * ensurePracticeRecruit() idempotent: repeated calls target the same doc instead of
 * creating duplicates.
 *
 * NOT `__practice__` — Firestore rejects any document id matching `__.*__` as reserved for
 * internal use (`INVALID_ARGUMENT: Resource id "__practice__" is invalid because it is
 * reserved`), confirmed against the Firestore emulator, which enforces the same validation
 * as production. That id would make every ensurePracticeRecruit() call fail in the field.
 */
export const PRACTICE_RECRUIT_ID = "practice-recruit";

/**
 * Ensures the practice recruit doc exists, without ever clobbering fields an admin may have
 * hand-edited (e.g. a future custom photo) or duplicating the doc. Called on every mount of
 * the test picker (and only there — Manage Recruits does not seed this doc) — `merge: true`
 * makes repeated calls a no-op once the doc exists.
 *
 * firestore.rules scopes `recruits/*` writes to administrators plus staff writing only this
 * fixed practice-recruit doc, so both admins and evaluators can call this successfully. A
 * permission-denied here is not expected/normal — it indicates a real problem (e.g. the
 * caller isn't signed in as active staff, or firestore.rules and PRACTICE_RECRUIT_ID have
 * drifted out of sync) and should be surfaced, not silently swallowed.
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
