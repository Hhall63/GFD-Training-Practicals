import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

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
    await deleteApp(secondaryApp);
  }
}
