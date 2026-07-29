#!/usr/bin/env node
// Seeds the local Firebase Emulator Suite (already running — started by `npm run
// emulators` or, more commonly, by `npm run sandbox`) with a fixed admin login and a few
// sample records, so the sandbox never lands on an empty "create first administrator"
// screen. Talks to the emulator only — this script must never be pointed at production.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  addDoc,
  collection,
} from "firebase/firestore";

// Fake placeholder values — must match web/.env.sandbox's VITE_FIREBASE_* values exactly
// (only projectId is functionally load-bearing; the rest just need to be present).
const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "demo-gfd-sandbox.firebaseapp.com",
  projectId: "demo-gfd-sandbox",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

export const SANDBOX_ADMIN_EMAIL = "sandbox@example.com";
export const SANDBOX_ADMIN_PASSWORD = "sandbox123";

async function main() {
  const app = initializeApp(firebaseConfig, `seed-sandbox-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);

  // 1. First admin — same two-write shape as AuthContext.jsx's createFirstAdmin(), so this
  // account behaves identically to one created through the real Setup Admin screen.
  const credential = await createUserWithEmailAndPassword(
    auth,
    SANDBOX_ADMIN_EMAIL,
    SANDBOX_ADMIN_PASSWORD
  );
  await setDoc(doc(db, "admins", credential.user.uid), {
    email: SANDBOX_ADMIN_EMAIL,
    displayName: "Sandbox Admin",
    role: "admin",
    isActive: true,
    notifyOnFailures: false,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  });
  await setDoc(doc(db, "meta", "appState"), { firstAdminCreated: true });

  // 2. Practice recruit — same fixed doc id/shape as lib/practiceRecruit.js's
  // ensurePracticeRecruit(), so the app's built-in practice flow works in the sandbox too.
  await setDoc(doc(db, "recruits", "practice-recruit"), {
    isPractice: true,
    isActive: true,
    firstName: "Test",
    lastName: "Recruit",
    recruitClassOrCohort: "Practice",
  });

  // 3. A couple of sample recruits — same shape RecruitsAdminPage.jsx writes.
  await addDoc(collection(db, "recruits"), {
    firstName: "Jordan",
    lastName: "Rivera",
    recruitClassOrCohort: "Sandbox Cohort",
    badgeOrIdNumber: null,
    isActive: true,
    createdAt: new Date(),
  });
  await addDoc(collection(db, "recruits"), {
    firstName: "Casey",
    lastName: "Nguyen",
    recruitClassOrCohort: "Sandbox Cohort",
    badgeOrIdNumber: null,
    isActive: true,
    createdAt: new Date(),
  });

  // 4. One sample, published test template with a few graded steps — same shape
  // TemplatesAdminPage.jsx / TemplateEditorPage.jsx write.
  const now = new Date();
  const template = await addDoc(collection(db, "templates"), {
    name: "Sandbox Sample Test",
    description: "Seeded sample test for local development — safe to edit or delete.",
    version: 1,
    isActive: true,
    status: "published",
    passingPercentage: 70,
    createdAt: now,
    updatedAt: now,
  });
  const lines = [
    {
      lineType: "instruction",
      lineText: "Explain the task to the recruit before starting the timer.",
      isScored: false,
      passThresholdSeconds: null,
      points: null,
      isCritical: false,
      sortOrder: 0,
    },
    {
      lineType: "graded",
      lineText: "Dons PPE correctly within the time limit",
      isScored: true,
      passThresholdSeconds: null,
      points: 10,
      isCritical: false,
      sortOrder: 1,
    },
    {
      lineType: "timer",
      lineText: "Overall completion time",
      isScored: true,
      passThresholdSeconds: 120,
      points: 10,
      isCritical: false,
      sortOrder: 2,
    },
  ];
  for (const line of lines) {
    await addDoc(collection(db, "templates", template.id, "lines"), line);
  }

  console.log("Sandbox seeded.");
  console.log(`  Admin login: ${SANDBOX_ADMIN_EMAIL} / ${SANDBOX_ADMIN_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding the sandbox failed:", err);
  process.exit(1);
});
