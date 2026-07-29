# Local Emulator Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a one-command local sandbox (`npm run sandbox`) that runs the app against a fully isolated, fake Firebase backend (Auth + Firestore emulators) pre-loaded with sample data, so new features can be built and clicked through with zero risk to the real production Firestore project.

**Architecture:** Reuses the emulator-mode wiring already present in `web/src/firebase.js` (`VITE_USE_EMULATOR=1`) and the emulator ports already declared in `web/firebase.json`. Adds a committed, git-tracked fake env file (`web/.env.sandbox`) loaded via Vite's `--mode sandbox`, a seed script that writes sample data through the Firebase JS client SDK (proving the app's real `firestore.rules` bootstrap path works, not bypassing them), and a thin Node orchestrator invoked by `firebase emulators:exec` — which owns emulator startup/shutdown itself, so no custom process-tree management is needed. See `docs/superpowers/specs/2026-07-28-local-emulator-sandbox-design.md` for full rationale.

**Tech Stack:** Firebase JS SDK v10 (already a dependency), firebase-tools CLI (already installed — confirmed `15.22.4` via `npx firebase --version`, already logged in), Node.js ESM scripts (`web/package.json` has `"type": "module"`), Vite 5 (`--mode` flag). No unit-test framework is installed in `web/` (consistent with every other recent plan in this repo) — verification is running the actual commands and driving the app in a browser.

## Global Constraints

- `web/.env.sandbox` is committed to git. It holds no real secrets — only fake, meaningless placeholder values (`demo-gfd-sandbox` project id) that the Auth/Firestore emulators accept unconditionally. `web/.env` (the real project's credentials) is untouched and stays gitignored.
- The sandbox Firebase project id is `demo-gfd-sandbox` everywhere it appears (`.env.sandbox`, `seed-sandbox.mjs`'s `firebaseConfig`, and the `--project` flag in the `sandbox`/`emulators` npm scripts) — the `demo-` prefix is what tells the Firebase CLI/SDKs this is a fully offline, no-real-project id, so no login or cloud project is ever required.
- Emulator lifecycle (start/stop, and cleanup on Ctrl+C) is entirely owned by `firebase emulators:exec` — no custom code polls ports or kills child processes. This avoids reimplementing Windows-specific process-tree cleanup, which `firebase-tools` already handles.
- The seed script authenticates as a real emulator-created user and writes through the client SDK (same `firestore.rules` bootstrap path `SetupAdminPage`/`AuthContext.createFirstAdmin` uses in the real app) — it does not use the emulator's rules-bypass REST endpoints.
- Every seeded document shape mirrors an existing, real write path in this codebase exactly (see the file/line references in each task) — no invented fields.
- `npm run dev` (real `.env`, real Firebase project) is not modified by any task in this plan.

---

### Task 1: Sandbox env file + base npm scripts

**Files:**
- Create: `web/.env.sandbox`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `npm run emulators` (starts Auth+Firestore emulators standalone) and `npm run dev:sandbox` (starts the dev server pointed at them) — both consumed by Task 3's orchestrator, and both independently runnable by a developer in two terminals.

- [x] **Step 1: Create `web/.env.sandbox`**

```
# Fake Firebase config for the local emulator sandbox only — never a real project, never
# used against production. Values are meaningless placeholders; the Auth/Firestore
# emulators accept any of them. Committed to git on purpose: nothing here is a secret.
#
# Loaded automatically by `vite --mode sandbox` (see package.json's "dev:sandbox" script).
# The project id (demo-gfd-sandbox) MUST match web/scripts/seed-sandbox.mjs's
# firebaseConfig.projectId and the --project flag in package.json's "sandbox"/"emulators"
# scripts — all four have to agree for the app and the seed script to land in the same
# emulator instance.
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-gfd-sandbox.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-gfd-sandbox
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
VITE_USE_EMULATOR=1
```

- [x] **Step 2: Add `emulators` and `dev:sandbox` scripts to `web/package.json`**

In `web/package.json`, the `"scripts"` block currently reads:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build && firebase deploy"
  },
```

Replace it with:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build && firebase deploy",
    "emulators": "firebase emulators:start --only auth,firestore --project demo-gfd-sandbox",
    "dev:sandbox": "vite --mode sandbox"
  },
```

- [x] **Step 3: Verify the env file loads and the emulator flag is honored**

Terminal 1, from `web/`:
```bash
npm run emulators
```
Expected: prints `✔  All emulators ready!` and an Emulator Hub URL. Leave running.

Terminal 2, from `web/`:
```bash
npm run dev:sandbox
```
Expected: prints a `Local: http://localhost:5173/` URL (or the next free port). Open it in a browser — expect the **"Create the first administrator account"** setup screen (no data seeded yet, that's Task 2). This confirms `--mode sandbox` loaded `.env.sandbox` and the app connected to the emulator instead of hanging/erroring against a nonexistent real `demo-gfd-sandbox` cloud project.

Stop both (Ctrl+C in each terminal).

- [x] **Step 4: Spot-check `.env.sandbox` before committing**

Open `web/.env.sandbox` and confirm `VITE_FIREBASE_PROJECT_ID` reads `demo-gfd-sandbox` (not `gfd-recruit-training`, the real production project id from `web/.env`) and every other value is one of the placeholder strings from Step 1 — never a value copied from `web/.env`.

- [x] **Step 5: Commit**

```bash
git add web/.env.sandbox web/package.json
git commit -m "feat: add sandbox env file and emulator/dev npm scripts"
```

---

### Task 2: Seed script

**Files:**
- Create: `web/scripts/seed-sandbox.mjs`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: nothing from Task 1's code (only its running emulators, at fixed `127.0.0.1:9099`/`127.0.0.1:8080`).
- Produces: `npm run seed:sandbox` — a script that exits `0` on success, non-zero on failure. Consumed by Task 3's orchestrator. Also exports `SANDBOX_ADMIN_EMAIL`/`SANDBOX_ADMIN_PASSWORD` constants (`"sandbox@example.com"` / `"sandbox123"`) for Task 4's instructions file to reference verbatim.

- [x] **Step 1: Create `web/scripts/seed-sandbox.mjs`**

```javascript
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
```

- [x] **Step 2: Add `seed:sandbox` script to `web/package.json`**

Add this line to the `"scripts"` block added in Task 1:

```json
    "seed:sandbox": "node scripts/seed-sandbox.mjs",
```

Full block after this change:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build && firebase deploy",
    "emulators": "firebase emulators:start --only auth,firestore --project demo-gfd-sandbox",
    "dev:sandbox": "vite --mode sandbox",
    "seed:sandbox": "node scripts/seed-sandbox.mjs"
  },
```

- [x] **Step 3: Verify seeding works and the app picks it up**

Terminal 1, from `web/`:
```bash
npm run emulators
```
Expected: `✔  All emulators ready!`. Leave running.

Terminal 2, from `web/`:
```bash
npm run seed:sandbox
```
Expected output ends with:
```
Sandbox seeded.
  Admin login: sandbox@example.com / sandbox123
```

Same terminal:
```bash
npm run dev:sandbox
```
Open the printed URL. Expected: the **Login** screen (not Setup Admin — confirms `meta/appState` was written). Sign in with `sandbox@example.com` / `sandbox123`. Expected: lands on the admin dashboard; Manage Recruits shows "Jordan Rivera" and "Casey Nguyen"; Manage Tests shows "Sandbox Sample Test"; Home/Start Test shows "Sandbox Sample Test" as a runnable tile.

Stop both (Ctrl+C in each terminal).

- [x] **Step 4: Commit**

```bash
git add web/scripts/seed-sandbox.mjs web/package.json
git commit -m "feat: add sandbox seed script for fake admin, recruits, and a sample test"
```

---

### Task 3: One-command orchestrator (`npm run sandbox`)

**Files:**
- Create: `web/scripts/run-sandbox.mjs`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `npm run seed:sandbox` and `npm run dev:sandbox` (both from Tasks 1–2, run as child processes via `npm.cmd`/`npm` — cross-platform without requiring `shell: true`).
- Produces: `npm run sandbox` — the single command a developer runs. Nothing else depends on this.

- [x] **Step 1: Create `web/scripts/run-sandbox.mjs`**

```javascript
#!/usr/bin/env node
// Invoked by `firebase emulators:exec` (see package.json's "sandbox" script) only after the
// Auth/Firestore emulators are confirmed up and accepting connections — no manual
// "wait for ready" polling needed here. Seeds fresh data, then starts the sandbox dev
// server. Ctrl+C stops the dev server and this script; emulators:exec then tears the
// emulators down on its own — no custom process-tree cleanup needed here.
import { spawnSync } from "node:child_process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const seed = spawnSync(npmCmd, ["run", "seed:sandbox"], { stdio: "inherit" });
if (seed.status !== 0) {
  process.exit(seed.status ?? 1);
}

const dev = spawnSync(npmCmd, ["run", "dev:sandbox"], { stdio: "inherit" });
process.exit(dev.status ?? 0);
```

- [x] **Step 2: Add `sandbox` script to `web/package.json`**

Add this line to the `"scripts"` block:

```json
    "sandbox": "firebase emulators:exec --project demo-gfd-sandbox --only auth,firestore \"node scripts/run-sandbox.mjs\"",
```

Full block after this change:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build && firebase deploy",
    "emulators": "firebase emulators:start --only auth,firestore --project demo-gfd-sandbox",
    "dev:sandbox": "vite --mode sandbox",
    "seed:sandbox": "node scripts/seed-sandbox.mjs",
    "sandbox": "firebase emulators:exec --project demo-gfd-sandbox --only auth,firestore \"node scripts/run-sandbox.mjs\""
  },
```

- [x] **Step 3: Verify the single-command flow end-to-end**

From `web/`:
```bash
npm run sandbox
```
Expected: emulators start, then `Sandbox seeded. / Admin login: sandbox@example.com / sandbox123` prints, then a `Local: http://...` Vite URL prints — all in one terminal, one command. Open the URL, sign in with the printed credentials, confirm the same seeded data from Task 2's Step 3 is present.

Press Ctrl+C once. Expected: the dev server and emulators both shut down and control returns to the prompt within a few seconds (no hang).

Confirm no leftover process is holding the emulator ports:
```bash
npm run sandbox
```
Expected: starts cleanly a second time with no "port already in use" error — proves the first run's Ctrl+C fully released ports 9099/8080 (this is the check that would catch an orphaned emulator process on Windows). Press Ctrl+C again to stop.

Confirm production is untouched:
```bash
npm run dev
```
Expected: starts against the real `.env`/production project exactly as before this plan (unrelated to any sandbox script). Stop it (Ctrl+C).

- [x] **Step 4: Commit**

```bash
git add web/scripts/run-sandbox.mjs web/package.json
git commit -m "feat: add npm run sandbox as a single-command emulator sandbox"
```

---

### Task 4: Desktop instructions file

**Files:**
- Create: `C:\Users\ffhal\OneDrive\Desktop\GFD Sandbox Instructions.txt` (outside the git repo — this machine's OneDrive-redirected Desktop, confirmed in the design spec)

**Interfaces:**
- Consumes: the exact command (`npm run sandbox`) and credentials (`sandbox@example.com` / `sandbox123`) established in Tasks 2–3.
- Produces: nothing consumed by other tasks — this is the last task.

- [x] **Step 1: Write the instructions file**

Create `C:\Users\ffhal\OneDrive\Desktop\GFD Sandbox Instructions.txt` with this content:

```
GFD RECRUIT TESTING — LOCAL SANDBOX
====================================

What this is:
A private practice copy of the app that runs only on this computer. It is
completely separate from the real app — nothing you do here can affect
real recruit data, admin accounts, or test results.

HOW TO START IT
----------------
1. Open a terminal (PowerShell): press the Windows key, type "PowerShell",
   press Enter.
2. Copy and paste this, then press Enter:

   cd "C:\Users\ffhal\GFD-Training-Practicals\web"

3. Copy and paste this, then press Enter:

   npm run sandbox

4. Wait until you see a line that looks like:

   Local:   http://localhost:5173/

   Ctrl-click that link (or copy/paste it into a browser) to open the app.

HOW TO LOG IN
-------------
Email:    sandbox@example.com
Password: sandbox123

You'll already see a couple of sample recruits (Jordan Rivera, Casey
Nguyen) and one sample test ("Sandbox Sample Test") ready to use.

HOW TO STOP IT
--------------
Click back into the terminal window and press Ctrl+C once. Wait a few
seconds for it to fully shut down before closing the window.

STARTING FRESH
---------------
Every time you run "npm run sandbox", it starts over from the same clean
sample data above — anything you added or changed in a previous sandbox
session is gone. This is on purpose, so the sandbox never gets messy.

If something goes wrong, just close the terminal window, open a new one,
and repeat the steps under "HOW TO START IT" above.
```

- [x] **Step 2: Verify the file opens correctly**

Confirm the file exists and opens in Notepad (double-click it, or from the terminal: `notepad "C:\Users\ffhal\OneDrive\Desktop\GFD Sandbox Instructions.txt"`), and that the text is readable with no missing lines.

- [x] **Step 3: No commit**

This file lives outside the git repository (`C:\Users\ffhal\GFD-Training-Practicals` is the repo root; the Desktop is not inside it) — there is nothing to commit for this task.
