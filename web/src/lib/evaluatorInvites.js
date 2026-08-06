// Creates evaluator accounts through the QR-invite flow — see
// docs/superpowers/specs/2026-08-06-evaluator-wizard-design.md. Never persists or displays
// the temp Firebase Auth password this generates; it only ever travels inside the
// evaluatorInvites doc, read back exclusively by claimEvaluatorInvite() in firebase.js.
import { doc, setDoc } from "firebase/firestore";
import { db, createUserAccountWithoutSigningIn } from "../firebase";

const AUTO_DEACTIVATE_HOUR = 18; // 6:00 PM local time
const INVITE_EXPIRY_DAYS = 7;

/** 6:00 PM local time on `now`'s date, or the next day's 6:00 PM if `now` is already at or
 * past 6:00 PM — so checking the auto-deactivate toggle after 6pm never creates an account
 * that's already expired. */
export function computeAutoDeactivateAt(now = new Date()) {
  const deadline = new Date(now);
  deadline.setHours(AUTO_DEACTIVATE_HOUR, 0, 0, 0);
  if (deadline <= now) {
    deadline.setDate(deadline.getDate() + 1);
  }
  return deadline;
}

/** Creates the evaluator's Firebase Auth account (via the existing no-sign-in-disruption
 * helper), its admins/{uid} doc, and a one-time evaluatorInvites/{token} claim doc. Returns
 * { token } — the caller (AddEvaluatorWizard.jsx) builds the /claim/{token} link and QR
 * from it. */
export async function createEvaluatorInvite({ email, displayName, autoDeactivate }) {
  const trimmedEmail = email.trim().toLowerCase();
  const tempAuthPassword = crypto.randomUUID();
  const uid = await createUserAccountWithoutSigningIn(trimmedEmail, tempAuthPassword);

  const now = new Date();
  await setDoc(doc(db, "admins", uid), {
    email: trimmedEmail,
    displayName,
    role: "evaluator",
    isActive: true,
    createdAt: now,
    mustChangePassword: true,
    ...(autoDeactivate ? { autoDeactivateAt: computeAutoDeactivateAt(now) } : {}),
  });

  const token = crypto.randomUUID();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
  await setDoc(doc(db, "evaluatorInvites", token), {
    uid,
    email: trimmedEmail,
    tempAuthPassword,
    used: false,
    createdAt: now,
    expiresAt,
  });

  return { token };
}
