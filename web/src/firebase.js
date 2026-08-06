import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithEmailAndPassword,
  updatePassword,
  signOut,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc } from "firebase/firestore";

// No Firebase Storage here on purpose — Google now requires the paid Blaze plan just to
// enable it, even though its free quotas are unchanged. Photos are stored as compressed
// data URLs directly in Firestore instead (see src/lib/image.js), keeping this app fully
// on the free Spark plan with no credit card required.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Local-development escape hatch: `VITE_USE_EMULATOR=1 npm run dev` points the app at the
// Firebase Local Emulator Suite (`firebase emulators:start --only auth,firestore`) instead
// of the real project — used for automated verification runs and offline development.
// Never set in a production build.
if (import.meta.env.VITE_USE_EMULATOR === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/**
 * Firebase Auth has no server here to create accounts "as an admin" without also signing in
 * as that new account — which would kick the currently logged-in admin out of their own
 * session. The standard client-only workaround: spin up a second, throwaway Firebase App
 * instance purely to create the auth user, then tear it down immediately. The primary app's
 * session (the admin who's actually doing the creating) is never touched.
 *
 * Returns the newly created user's uid.
 */
export async function createUserAccountWithoutSigningIn(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  if (import.meta.env.VITE_USE_EMULATOR === "1") {
    connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    return credential.user.uid;
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

/**
 * The public Live Dashboard (/live/:token, no login) needs its own Firebase Auth session
 * so an unattended display never disturbs a real admin's session sharing the same browser —
 * AuthProvider wraps every route on the single primary `auth` singleton above, and signing in
 * anonymously on it directly would sign that admin out in every other tab of the same
 * browser. Same secondary-app technique as createUserAccountWithoutSigningIn, except this one
 * stays alive for the page's lifetime (the caller decides when to tear it down via the
 * returned cleanup(), typically on unmount) rather than being torn down immediately.
 *
 * Returns the secondary app's own `auth` and `db` — callers must read Firestore through this
 * `db`, not the primary export above, or the reads run under the wrong (or no) credential.
 */
export async function signInAnonymouslyOnSecondaryApp() {
  const secondaryApp = initializeApp(firebaseConfig, `live-dashboard-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb = getFirestore(secondaryApp);
  if (import.meta.env.VITE_USE_EMULATOR === "1") {
    connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(secondaryDb, "127.0.0.1", 8080);
  }
  await signInAnonymously(secondaryAuth);

  async function cleanup() {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }

  return { auth: secondaryAuth, db: secondaryDb, cleanup };
}

/**
 * Claims an evaluator invite (docs/superpowers/specs/2026-08-06-evaluator-wizard-design.md):
 * signs in as the pre-created account using its system-generated temp password (never
 * exposed to the evaluator), sets it to the password they chose, clears
 * mustChangePassword, and marks the invite used — all on a throwaway secondary Firebase
 * App instance, same technique as createUserAccountWithoutSigningIn above, so claiming an
 * invite can never disrupt an admin's session sharing this browser (e.g. testing a QR they
 * just generated in another tab).
 *
 * Re-reads the invite fresh via the secondary app rather than trusting an earlier read, to
 * close the gap between a page showing "this invite looks valid" and the moment it's
 * actually claimed. Throws an Error with `.code` set to "invite/not-found", "invite/used",
 * or "invite/expired" for those cases. If updatePassword() succeeds but a write
 * afterward fails, throws with `.code` "invite/partial-claim" — the new password is
 * already live at that point, so callers must not treat this as a full failure. Any
 * other Firebase Auth failure (e.g. network, before updatePassword) passes through with
 * its own existing `.code`.
 */
export async function claimEvaluatorInvite(token, newPassword) {
  const secondaryApp = initializeApp(firebaseConfig, `claim-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb = getFirestore(secondaryApp);
  if (import.meta.env.VITE_USE_EMULATOR === "1") {
    connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(secondaryDb, "127.0.0.1", 8080);
  }
  try {
    const inviteRef = doc(secondaryDb, "evaluatorInvites", token);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) {
      throw Object.assign(new Error("Invite not found"), { code: "invite/not-found" });
    }
    const invite = inviteSnap.data();
    if (invite.used) {
      throw Object.assign(new Error("Invite already used"), { code: "invite/used" });
    }
    if (invite.expiresAt.toDate() < new Date()) {
      throw Object.assign(new Error("Invite expired"), { code: "invite/expired" });
    }

    await signInWithEmailAndPassword(secondaryAuth, invite.email, invite.tempAuthPassword);
    await updatePassword(secondaryAuth.currentUser, newPassword);
    try {
      await updateDoc(doc(secondaryDb, "admins", invite.uid), { mustChangePassword: false });
      await updateDoc(inviteRef, { used: true });
    } catch (err) {
      // The new password is already live in Firebase Auth by this point — only the
      // bookkeeping writes failed. The caller must not report this as a generic failure:
      // the evaluator can already sign in with the password they just set.
      throw Object.assign(new Error("Password set, but finishing setup failed"), {
        code: "invite/partial-claim",
        cause: err,
      });
    }
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}
