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
  // Set when we can't reach the database at all. The app must show an error screen in
  // that case — never the first-run setup screen, which would badly confuse an evaluator
  // on a dead connection.
  const [connectionError, setConnectionError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, "admins", user.uid));
          setAdminDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        } catch (err) {
          console.error("Failed to load account", err);
          setConnectionError(true);
          setAdminDoc(null);
        }
      } else {
        setAdminDoc(null);
      }
    });
    return unsubscribe;
  }, [retryToken]);

  useEffect(() => {
    getDoc(doc(db, "meta", "appState"))
      .then((snap) => {
        setAnyAdminExists(snap.exists() && snap.data().firstAdminCreated === true);
        setConnectionError(false);
      })
      .catch((err) => {
        console.error("Failed to check app setup state", err);
        setConnectionError(true);
      })
      .finally(() => {
        setAppStateChecked(true);
      });
  }, [adminDoc, retryToken]);

  function retryConnection() {
    setAppStateChecked(false);
    setConnectionError(false);
    setRetryToken((t) => t + 1);
  }

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

  /** Self-service password reset via a real emailed link — possible because accounts use
   * real email addresses. */
  async function requestPasswordReset(email) {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  }

  /** Used only by the one-time Setup Admin screen, when no admin exists yet. */
  async function createFirstAdmin({ uid, email, displayName }) {
    await setDoc(doc(db, "admins", uid), {
      email: email.trim().toLowerCase(),
      displayName,
      role: "admin",
      isActive: true,
      notifyOnFailures: false,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    await setDoc(doc(db, "meta", "appState"), { firstAdminCreated: true });
  }

  const loading = firebaseUser === undefined || !appStateChecked;
  // Accounts created before roles existed have no `role` field — treated as "admin".
  const role = adminDoc ? (adminDoc.role ?? "admin") : null;
  const isAdmin = !adminDoc || role === "admin";
  const isRecruit = role === "recruit";
  const isStaff = role === "admin" || role === "evaluator";

  return (
    <AuthContext.Provider
      value={{
        loading,
        firebaseUser: firebaseUser ?? null,
        adminDoc,
        role,
        isAdmin,
        isRecruit,
        isStaff,
        anyAdminExists,
        connectionError,
        retryConnection,
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
