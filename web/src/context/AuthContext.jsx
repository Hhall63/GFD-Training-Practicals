import { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = not yet resolved
  const [adminDoc, setAdminDoc] = useState(null);
  const [appStateChecked, setAppStateChecked] = useState(false);
  const [anyAdminExists, setAnyAdminExists] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, "admins", user.uid));
          setAdminDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        } catch (err) {
          // A transient network error here shouldn't leave the app stuck on a loading
          // screen forever — fall back to "no admin doc" and let the user retry signing in.
          console.error("Failed to load admin doc", err);
          setAdminDoc(null);
        }
      } else {
        setAdminDoc(null);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    getDoc(doc(db, "meta", "appState"))
      .then((snap) => {
        setAnyAdminExists(snap.exists() && snap.data().firstAdminCreated === true);
      })
      .catch((err) => {
        console.error("Failed to check app setup state", err);
      })
      .finally(() => {
        setAppStateChecked(true);
      });
  }, [adminDoc]);

  async function login(email, password) {
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    // lastLoginAt is best-effort; ignore failures (e.g. offline).
    if (auth.currentUser) {
      updateDoc(doc(db, "admins", auth.currentUser.uid), { lastLoginAt: serverTimestamp() }).catch(
        () => {}
      );
    }
  }

  async function logout() {
    await firebaseSignOut(auth);
  }

  /** Lets an admin who forgot their password reset it themselves via a real emailed link —
   * this only works because admin accounts use real email addresses, unlike the old
   * fake-domain-username idea, which would have made self-service reset impossible. */
  async function requestPasswordReset(email) {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  }

  /** Used only by the one-time Setup Admin screen, when no admin exists yet. */
  async function createFirstAdmin({ uid, email, displayName }) {
    await setDoc(doc(db, "admins", uid), {
      email: email.trim().toLowerCase(),
      displayName,
      isActive: true,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    await setDoc(doc(db, "meta", "appState"), { firstAdminCreated: true });
  }

  const loading = firebaseUser === undefined || !appStateChecked;

  return (
    <AuthContext.Provider
      value={{
        loading,
        firebaseUser: firebaseUser ?? null,
        adminDoc,
        anyAdminExists,
        login,
        logout,
        requestPasswordReset,
        createFirstAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
