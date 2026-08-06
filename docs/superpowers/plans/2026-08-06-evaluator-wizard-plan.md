# Add-Evaluator Wizard (QR Invite + Auto-Deactivate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "+ Add Evaluator" wizard that creates an evaluator account with no temp password ever shown to anyone, generates a per-evaluator QR code the evaluator scans to set their own password, and an optional same-day 6:00 PM auto-deactivate — enforced entirely in Firestore security rules, no scheduled jobs.

**Architecture:** One new Firestore collection (`evaluatorInvites`) and one extended security-rule function; a small library module that creates the invite; a new admin-side wizard component; a new public claim page + route; one new email variant reusing existing EmailJS plumbing; and the existing "Add User" modal narrowed to admin-only accounts (evaluators move entirely to the new flow). No backend/Cloud Functions — auto-deactivate is enforced by comparing a stored deadline against Firestore's own server clock (`request.time`) inside the existing `isActiveUser()` rule function.

**Tech Stack:** React (existing components/hooks), `firebase/firestore` + `firebase/auth` (existing, new calls follow existing patterns in this codebase), `qrcode` (new npm dependency — nothing existing generates QR images).

## Global Constraints

- **Auto-deactivate is a rules-level gate, not a client-side check.** `isActiveUser()` in `firestore.rules` gains one clause: `&& (!('autoDeactivateAt' in myUserDoc()) || myUserDoc().autoDeactivateAt > request.time)`. Every other rule already calls this function (directly or via `isStaff()`/`isAdminRole()`/`isRecruitRole()`) — do not duplicate the check anywhere else.
- **Fixed 6:00 PM, not configurable.** `computeAutoDeactivateAt(now)`: 18:00:00.000 local time on `now`'s date, or the next day's 18:00 if `now` is already ≥ 18:00. No time picker, no other cutoff hour.
- **Invite tokens:** `crypto.randomUUID()` (built into every evergreen browser — no new dependency), used as both the Firestore doc ID under `evaluatorInvites/{token}` and the `/claim/{token}` route segment. 7-day expiry (`createdAt` + 7 days).
- **`evaluatorInvites` documents:** `{ uid, email, tempAuthPassword, used, createdAt, expiresAt }`. `tempAuthPassword` is a `crypto.randomUUID()` generated when the wizard creates the account — never shown to the admin or the evaluator anywhere in the UI.
- **Firestore rules for the new collection** (model this exactly on the existing `publicLiveLinks/{token}` block — same "unguessable ID is the credential" shape already in this file):
  ```
  match /evaluatorInvites/{token} {
    allow get: if true;
    allow list: if false;
    allow create: if isAdminRole();
    allow update: if isSignedIn()
      && request.auth.uid == resource.data.uid
      && resource.data.used == false
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['used'])
      && request.resource.data.used == true;
    allow delete: if false;
  }
  ```
  No change needed to the existing `admins/{adminId}` `allow update` rule — its existing self-service clause (`request.auth.uid == adminId && diff(...).affectedKeys().hasOnly(['mustChangePassword']) && request.resource.data.mustChangePassword == false`) already covers the claim flow's own `mustChangePassword: false` write.
- **The claim flow never touches the primary `auth`/`db` singleton for sign-in.** It must use a throwaway secondary Firebase App instance (same technique `createUserAccountWithoutSigningIn` and `signInAnonymouslyOnSecondaryApp` already use in `web/src/firebase.js`), so claiming an invite can never disrupt an admin's session sharing the same browser (e.g. testing a QR they just generated). Reading the invite doc for *display* purposes (before the evaluator submits) may use the primary `db` — it's a public, unauthenticated `get`, harmless. Only the actual sign-in/`updatePassword`/writes must go through the secondary app.
- **Dates:** match this codebase's existing convention of passing raw JS `Date` objects directly to Firestore writes (e.g. `createdAt: new Date()` throughout the app) — do not wrap in `Timestamp.fromDate()`; the SDK converts automatically. Reading a stored date back uses `.toDate()`, matching existing usages (e.g. `notify.js`'s `session.startedAt?.toDate?.()`).
- **`NewUserModal` becomes admin-only** — see Task 6. `AddEvaluatorWizard` (the new component) is a separate, independent creation path for evaluators, not a mode of the old modal.
- No unit-test framework exists in `web/` — verification is via grep + `npm run build` per task, plus a live end-to-end browser pass in the final task (this repo's established convention).

---

### Task 1: Firestore rules — auto-deactivate gate + evaluatorInvites collection

**Files:**
- Modify: `web/firestore.rules`

**Interfaces:**
- Consumes: nothing new.
- Produces: the extended `isActiveUser()` behavior every later task's writes rely on being enforced, and the `evaluatorInvites` collection's access rules Tasks 2, 4, and 5 read/write against.

- [ ] **Step 1: Confirm the current rule**

```bash
cd web && grep -n "function isActiveUser" -A 5 firestore.rules
```

Expected:
```
    function isActiveUser() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
        && myUserDoc().isActive == true;
    }
```

- [ ] **Step 2: Modify `web/firestore.rules`**

Replace:

```
    // Any signed-in, active account of any role (Administrator, Evaluator, or Recruit).
    function isActiveUser() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
        && myUserDoc().isActive == true;
    }
```

with:

```
    // Any signed-in, active account of any role (Administrator, Evaluator, or Recruit).
    // The autoDeactivateAt clause enforces the evaluator-wizard's optional same-day cutoff
    // (docs/superpowers/specs/2026-08-06-evaluator-wizard-design.md) directly against
    // Firestore's own server clock — no scheduled job needed, and every rule below already
    // routes through this one function, so the cutoff applies everywhere at once.
    function isActiveUser() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
        && myUserDoc().isActive == true
        && (!('autoDeactivateAt' in myUserDoc()) || myUserDoc().autoDeactivateAt > request.time);
    }
```

Add a new match block immediately after the existing `match /publicLiveLinks/{token} { ... }` block (currently lines 84–91), before `match /recruits/{recruitId} {`:

```
    match /evaluatorInvites/{token} {
      // Same "the unguessable ID is the credential" model as publicLiveLinks above: get by
      // exact token is public (the evaluator claiming their account isn't signed in yet),
      // list is never allowed so invites can't be enumerated or guessed. Only the invited
      // account itself (once it's the signed-in user, mid-claim) may flip `used` to true,
      // and only that one field, and only one-way.
      allow get: if true;
      allow list: if false;
      allow create: if isAdminRole();
      allow update: if isSignedIn()
        && request.auth.uid == resource.data.uid
        && resource.data.used == false
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['used'])
        && request.resource.data.used == true;
      allow delete: if false;
    }
```

- [ ] **Step 3: Confirm both changes are in place**

```bash
cd web && grep -n "autoDeactivateAt" firestore.rules; grep -n "match /evaluatorInvites" firestore.rules
```

Expected: first command finds two matches (the `'autoDeactivateAt' in myUserDoc()` check and the comment mentioning it); second finds one match.

- [ ] **Step 4: Validate the rules file parses**

```bash
cd web && firebase emulators:exec --project demo-gfd-sandbox --only firestore "echo rules-ok"
```

Expected: prints `rules-ok` with no rules-compilation error (the emulator refuses to start if `firestore.rules` has a syntax error, so a successful start is the validation).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules && git commit -m "$(cat <<'EOF'
feat: enforce evaluator auto-deactivate and add evaluatorInvites rules

isActiveUser() now also checks an optional autoDeactivateAt deadline
against Firestore's own server clock — every existing rule already
routes through this one function, so a past-deadline account loses
all Firestore access instantly, with no scheduled job. Also adds
access rules for the new evaluatorInvites collection, modeled on the
existing publicLiveLinks token pattern.
EOF
)"
```

---

### Task 2: `evaluatorInvites.js` — invite creation library

**Files:**
- Create: `web/src/lib/evaluatorInvites.js`

**Interfaces:**
- Consumes: `createUserAccountWithoutSigningIn` from `../firebase` (existing, unchanged), `db` from `../firebase` (existing).
- Produces: `computeAutoDeactivateAt(now = new Date())` → `Date`. `createEvaluatorInvite({ email, displayName, autoDeactivate })` → `Promise<{ token: string }>`. Task 4 imports both.

- [ ] **Step 1: Write the verification script for `computeAutoDeactivateAt` (the "test") before writing the real module**

Create `web/verify-auto-deactivate.mjs`:

```js
// Scratch verification for evaluatorInvites.js's computeAutoDeactivateAt — pure logic, no
// Firebase needed, so this duplicates just the function rather than importing the real
// module. Deleted at the end of this task.
function computeAutoDeactivateAt(now) {
  const deadline = new Date(now);
  deadline.setHours(18, 0, 0, 0);
  if (deadline <= now) {
    deadline.setDate(deadline.getDate() + 1);
  }
  return deadline;
}

const checks = [
  [
    computeAutoDeactivateAt(new Date(2026, 0, 15, 9, 0, 0)).getTime(),
    new Date(2026, 0, 15, 18, 0, 0, 0).getTime(),
    "created 9am -> same-day 6pm",
  ],
  [
    computeAutoDeactivateAt(new Date(2026, 0, 15, 17, 59, 59)).getTime(),
    new Date(2026, 0, 15, 18, 0, 0, 0).getTime(),
    "created 5:59:59pm -> same-day 6pm (still before)",
  ],
  [
    computeAutoDeactivateAt(new Date(2026, 0, 15, 18, 0, 0)).getTime(),
    new Date(2026, 0, 16, 18, 0, 0, 0).getTime(),
    "created exactly 6:00:00pm -> rolls to next day",
  ],
  [
    computeAutoDeactivateAt(new Date(2026, 0, 15, 21, 30, 0)).getTime(),
    new Date(2026, 0, 16, 18, 0, 0, 0).getTime(),
    "created 9:30pm -> next-day 6pm",
  ],
];

let allPass = true;
for (const [actual, expected, label] of checks) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) allPass = false;
}
if (!allPass) process.exit(1);
console.log("ALL PASS");
```

- [ ] **Step 2: Run it to confirm the logic is sound**

Run: `cd web && node verify-auto-deactivate.mjs`
Expected: four `PASS` lines, then `ALL PASS`.

- [ ] **Step 3: Create `web/src/lib/evaluatorInvites.js`**

```js
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
```

- [ ] **Step 4: Confirm both exports exist and match the required signatures**

```bash
cd web && grep -n "export function computeAutoDeactivateAt\|export async function createEvaluatorInvite" src/lib/evaluatorInvites.js
```

Expected: two matches.

- [ ] **Step 5: Delete the scratch script and build clean**

```bash
cd web && rm -f verify-auto-deactivate.mjs && npm run build
```

Expected: clean build (the module isn't imported anywhere yet — this only catches syntax errors; Task 4 wires it in).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/evaluatorInvites.js && git commit -m "$(cat <<'EOF'
feat: add evaluatorInvites.js — evaluator account + invite creation

computeAutoDeactivateAt() computes the fixed 6pm-today-or-tomorrow
cutoff. createEvaluatorInvite() creates the Auth account with a
random never-shown temp password, the admins/{uid} doc, and a
one-time evaluatorInvites/{token} claim doc. Not wired into any page
yet — that's Task 4.
EOF
)"
```

---

### Task 3: `notify.js` — evaluator invite email

**Files:**
- Modify: `web/src/lib/notify.js` (add new exports; existing `sendWelcomeEmail`/`buildWelcomeBody` and everything else in the file are unchanged)

**Interfaces:**
- Consumes: `isWelcomeEmailConfigured`, `EMAILJS_SERVICE_ID`, `EMAILJS_WELCOME_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY` (all already defined earlier in the same file).
- Produces: `buildEvaluatorInviteSubject()` → `string`. `buildEvaluatorInviteBody({ toName, claimUrl })` → `string`. `sendEvaluatorInviteEmail({ toEmail, toName, claimUrl })` → `Promise<{ status, error }>` (same `"sent" | "not-configured" | "failed"` status contract as `sendWelcomeEmail`). Task 4 imports `sendEvaluatorInviteEmail`.

- [ ] **Step 1: Write the verification script for the two pure body/subject functions (the "test") before writing the real code**

Create `web/verify-invite-email.mjs`:

```js
// Scratch verification for notify.js's evaluator-invite email body — pure string
// functions, no Firebase/network needed. Deleted at the end of this task.
function buildEvaluatorInviteSubject() {
  return "You've been invited to GFD Recruit Testing";
}

function buildEvaluatorInviteBody({ toName, claimUrl }) {
  const lines = [];
  lines.push(`Hi ${toName},`);
  lines.push("");
  lines.push("You've been invited to GFD Recruit Testing as an evaluator.");
  lines.push("");
  lines.push(
    "Scan the QR code your administrator showed you, or open this link to set your password:"
  );
  lines.push(claimUrl);
  return lines.join("\n");
}

const subject = buildEvaluatorInviteSubject();
const body = buildEvaluatorInviteBody({ toName: "Jordan Rivera", claimUrl: "https://example.test/claim/abc123" });

const checks = [
  [subject.length > 0, true, "subject is non-empty"],
  [body.includes("Jordan Rivera"), true, "body includes the evaluator's name"],
  [body.includes("https://example.test/claim/abc123"), true, "body includes the claim link"],
  [body.toLowerCase().includes("password"), false, "body never mentions a password (no temp password to share)"],
];

let allPass = true;
for (const [actual, expected, label] of checks) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label} (got ${actual}, expected ${expected})`);
  if (!ok) allPass = false;
}
if (!allPass) process.exit(1);
console.log("ALL PASS");
```

- [ ] **Step 2: Run it to confirm the copy is correct**

Run: `cd web && node verify-invite-email.mjs`
Expected: four `PASS` lines, then `ALL PASS`.

- [ ] **Step 3: Modify `web/src/lib/notify.js`**

Insert immediately after the existing `sendWelcomeEmail` function (currently ending around line 92, right before the `fetchNotifyRecipients` comment block):

```js
export function buildEvaluatorInviteSubject() {
  return "You've been invited to GFD Recruit Testing";
}

/** Plain-text invite message: who this is for and the claim link — deliberately no
 * password, since the evaluator sets their own via the claim page instead of being handed
 * one. Mirrors buildWelcomeBody's shape (plain text, used directly as the EmailJS
 * "message" template variable). */
export function buildEvaluatorInviteBody({ toName, claimUrl }) {
  const lines = [];
  lines.push(`Hi ${toName},`);
  lines.push("");
  lines.push("You've been invited to GFD Recruit Testing as an evaluator.");
  lines.push("");
  lines.push(
    "Scan the QR code your administrator showed you, or open this link to set your password:"
  );
  lines.push(claimUrl);
  return lines.join("\n");
}

/**
 * Attempts automatic delivery of an evaluator-invite email via EmailJS, reusing the exact
 * same welcome template as sendWelcomeEmail (the template itself is just a generic
 * to_email/subject/message wrapper — no new EmailJS configuration needed). Same
 * best-effort contract: never throws, always resolves to { status, error }, same status
 * values as sendWelcomeEmail.
 */
export async function sendEvaluatorInviteEmail({ toEmail, toName, claimUrl }) {
  if (!isWelcomeEmailConfigured()) return { status: "not-configured", error: null };

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_WELCOME_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: toEmail,
          subject: buildEvaluatorInviteSubject(),
          message: buildEvaluatorInviteBody({ toName, claimUrl }),
        },
      }),
    });
    if (res.ok) return { status: "sent", error: null };
    const detail = await res.text().catch(() => "");
    console.error("EmailJS evaluator invite send failed", res.status, detail);
    return { status: "failed", error: `EmailJS ${res.status}${detail ? `: ${detail}` : ""}` };
  } catch (err) {
    console.error("EmailJS evaluator invite send threw", err);
    return { status: "failed", error: err?.message ?? "network error" };
  }
}
```

- [ ] **Step 4: Confirm the new exports exist and `sendWelcomeEmail`/`buildWelcomeBody` are untouched**

```bash
cd web && grep -n "export function buildEvaluatorInviteSubject\|export function buildEvaluatorInviteBody\|export async function sendEvaluatorInviteEmail" src/lib/notify.js; grep -c "export function buildWelcomeBody\|export async function sendWelcomeEmail" src/lib/notify.js
```

Expected: first command finds three matches; second prints `2` (both original functions still present, unmodified).

- [ ] **Step 5: Delete the scratch script and build clean**

```bash
cd web && rm -f verify-invite-email.mjs && npm run build
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/notify.js && git commit -m "$(cat <<'EOF'
feat: add evaluator-invite email (notify.js)

sendEvaluatorInviteEmail reuses the exact same EmailJS welcome
template as sendWelcomeEmail, with a new body that carries the
/claim/:token link instead of a temp password — no new EmailJS
configuration needed. sendWelcomeEmail/buildWelcomeBody unchanged,
still used by NewUserModal for admin accounts.
EOF
)"
```

---

### Task 4: `AddEvaluatorWizard.jsx` + wiring into `AdminsPage.jsx`

**Files:**
- Create: `web/src/components/AddEvaluatorWizard.jsx`
- Modify: `web/src/pages/AdminsPage.jsx` (add the "+ Add Evaluator" button/wizard render, and the lazy auto-deactivate sweep in the admins listener)
- Modify: `web/package.json` (add `qrcode` dependency)

**Interfaces:**
- Consumes: `createEvaluatorInvite` (Task 2), `sendEvaluatorInviteEmail` (Task 3), the `qrcode` package's `QRCode.toDataURL(text)` → `Promise<string>` (a `data:image/png;base64,...` URL).
- Produces: `export default function AddEvaluatorWizard({ onClose })` — a React component, self-contained (creates its own account+invite on submit, renders its own QR result screen). No other file consumes anything new from it beyond the render in `AdminsPage.jsx`.

- [ ] **Step 1: Install the QR code dependency**

```bash
cd web && npm install qrcode
```

Expected: `qrcode` added to `dependencies` in `web/package.json` and `web/package-lock.json`.

- [ ] **Step 2: Confirm the install**

```bash
cd web && grep -n '"qrcode"' package.json
```

Expected: one match under `"dependencies"`.

- [ ] **Step 3: Create `web/src/components/AddEvaluatorWizard.jsx`**

```jsx
import { useState } from "react";
import QRCode from "qrcode";
import { createEvaluatorInvite } from "../lib/evaluatorInvites";
import { sendEvaluatorInviteEmail } from "../lib/notify";

/** Creates an evaluator account with no temp password ever shown to anyone — the admin
 * only enters name/email and an optional same-day cutoff; the evaluator claims their
 * account by scanning a per-evaluator QR code (or opening the same link from the fallback
 * invite email) and setting their own password directly. See
 * docs/superpowers/specs/2026-08-06-evaluator-wizard-design.md. */
export default function AddEvaluatorWizard({ onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [autoDeactivate, setAutoDeactivate] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // null while filling out the form; { email, claimUrl, qrDataUrl, welcomeStatus } once
  // the account + invite exist — mirrors NewUserModal's `created` confirmation-view
  // pattern in AdminsPage.jsx.
  const [created, setCreated] = useState(null);

  const canSubmit = displayName && email;

  async function handleCreate() {
    setSubmitting(true);
    setError("");
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const { token } = await createEvaluatorInvite({ email: trimmedEmail, displayName, autoDeactivate });
      const claimUrl = `${window.location.origin}/claim/${token}`;
      const qrDataUrl = await QRCode.toDataURL(claimUrl);
      setCreated({ email: trimmedEmail, claimUrl, qrDataUrl, welcomeStatus: "sending" });
      const result = await sendEvaluatorInviteEmail({ toEmail: trimmedEmail, toName: displayName, claimUrl });
      setCreated((c) => ({ ...c, welcomeStatus: result.status }));
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "That email is already registered." : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      >
        <div className="card" style={{ width: 340, background: "white", textAlign: "center" }}>
          <h3 style={{ marginTop: 0 }}>Evaluator Invited</h3>
          <p style={{ margin: "0 0 8px" }}>{created.email}</p>
          <img src={created.qrDataUrl} alt="QR code to claim this evaluator account" style={{ width: 220, height: 220 }} />
          <p className="muted" style={{ marginTop: 8 }}>Have them scan this to set their password.</p>
          {created.welcomeStatus === "sending" && <p className="muted">Sending invite email…</p>}
          {created.welcomeStatus === "sent" && <p className="muted">Invite email sent to {created.email}.</p>}
          {(created.welcomeStatus === "not-configured" || created.welcomeStatus === "failed") && (
            <p className="muted">Invite email not sent — share this link manually: {created.claimUrl}</p>
          )}
          <button className="primary" style={{ marginTop: 12 }} disabled={created.welcomeStatus === "sending"} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 340, background: "white", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add Evaluator</h3>

        <div className="field">
          <label>Full Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={autoDeactivate}
              onChange={(e) => setAutoDeactivate(e.target.checked)}
              style={{ width: "auto", margin: 0 }}
            />
            Auto-deactivate at 6:00 PM
          </label>
          <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
            Deactivates automatically at 6:00 PM the day this account is created — or the
            next day, if created after 6:00 PM.
          </p>
        </div>

        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canSubmit || submitting} onClick={handleCreate}>
            {submitting ? "Creating…" : "Create & Generate QR"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the wizard into `web/src/pages/AdminsPage.jsx`**

Add the import (currently line 8, after the `sendWelcomeEmail` import):

```jsx
import { sendWelcomeEmail } from "../lib/notify";
import AddEvaluatorWizard from "../components/AddEvaluatorWizard";
```

Add a new state variable next to the existing `showNewUser` state (currently line 26):

```jsx
  const [showNewUser, setShowNewUser] = useState(searchParams.get("new") === "1");
  const [showAddEvaluator, setShowAddEvaluator] = useState(false);
```

Add the lazy auto-deactivate sweep inside the existing admins listener (currently lines 30–37):

```jsx
  useEffect(() => {
    const q = query(collection(db, "admins"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      // Recruit-role accounts live here too (same collection), but this page never shows
      // or creates them.
      const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => (u.role ?? "admin") !== "recruit");
      setUsers(loaded);
      // Lazy auto-deactivate sweep: firestore.rules already blocks all Firestore access
      // for anyone past their autoDeactivateAt deadline (see isActiveUser() there) — this
      // just keeps the visible list in sync so nobody LOOKS active when they can't
      // actually do anything, without needing a scheduled job. Best-effort; a failed write
      // here just means the list stays stale until the next load, not a security gap (the
      // rule already blocks the account regardless).
      const now = new Date();
      loaded
        .filter((u) => u.autoDeactivateAt && u.autoDeactivateAt.toDate() < now)
        .forEach((u) => updateDoc(doc(db, "admins", u.id), { isActive: false }).catch(() => {}));
    });
  }, []);
```

Replace the single "+ Add User" button (currently lines 165–167) with a row holding both buttons:

Change:

```jsx
        <button className="primary" onClick={() => setShowNewUser(true)}>
          + Add User
        </button>
```

to:

```jsx
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary" style={{ width: "auto" }} onClick={() => setShowNewUser(true)}>
            + Add User
          </button>
          <button className="primary" style={{ width: "auto" }} onClick={() => setShowAddEvaluator(true)}>
            + Add Evaluator
          </button>
        </div>
```

Add the wizard's render next to the existing modal render (currently line 170):

```jsx
      {showNewUser && <NewUserModal onClose={closeNewUserModal} />}
      {showAddEvaluator && <AddEvaluatorWizard onClose={() => setShowAddEvaluator(false)} />}
```

- [ ] **Step 5: Confirm the wiring**

```bash
cd web && grep -n "AddEvaluatorWizard\|showAddEvaluator\|autoDeactivateAt" src/pages/AdminsPage.jsx
```

Expected: finds the import, both state/render/button references to `showAddEvaluator`, and the sweep's `autoDeactivateAt` filter — at least 6 matches total.

- [ ] **Step 6: Build clean**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/src/components/AddEvaluatorWizard.jsx web/src/pages/AdminsPage.jsx && git commit -m "$(cat <<'EOF'
feat: add the Add Evaluator wizard with QR invite and auto-deactivate

New AddEvaluatorWizard.jsx: name/email + optional 6pm cutoff, then
shows a per-evaluator QR (via the new qrcode dependency) linking to
the /claim/:token page built in a later task, plus the same
best-effort invite-email attempt NewUserModal already does.
AdminsPage.jsx's admins listener also gets a lazy sweep that flips
isActive:false for anyone visibly past their autoDeactivateAt
deadline — cosmetic list accuracy only; firestore.rules already
enforces the actual access cutoff (Task 1).
EOF
)"
```

---

### Task 5: Claim flow — `firebase.js` + `ClaimInvitePage.jsx` + route

**Files:**
- Modify: `web/src/firebase.js` (add `claimEvaluatorInvite`)
- Create: `web/src/pages/ClaimInvitePage.jsx`
- Modify: `web/src/App.jsx` (add the `/claim/:token` public route)

**Interfaces:**
- Consumes: the `evaluatorInvites/{token}` doc shape from Task 2 (`{ uid, email, tempAuthPassword, used, createdAt, expiresAt }`), the rules from Task 1.
- Produces: `export async function claimEvaluatorInvite(token, newPassword)` — throws with `.code` of `"invite/not-found"`, `"invite/used"`, or `"invite/expired"` for known failure cases (or a raw Firebase Auth error for anything else, e.g. a network failure). `ClaimInvitePage` is the only consumer.

- [ ] **Step 1: Confirm the current imports in `web/src/firebase.js`**

```bash
cd web && grep -n "^import" firebase.js
```

Expected:
```
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInAnonymously, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
```

(Path shown is relative to `web/src/`; the actual file is `web/src/firebase.js`.)

- [ ] **Step 2: Modify `web/src/firebase.js`**

Change the two `firebase/auth` and `firebase/firestore` import lines from:

```js
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInAnonymously, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
```

to:

```js
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
```

Add this new function at the end of the file, after `signInAnonymouslyOnSecondaryApp`:

```js
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
 * or "invite/expired" for those cases; a Firebase Auth failure (e.g. network) passes
 * through with its own existing `.code`.
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
    await updateDoc(doc(secondaryDb, "admins", invite.uid), { mustChangePassword: false });
    await updateDoc(inviteRef, { used: true });
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp);
  }
}
```

- [ ] **Step 3: Create `web/src/pages/ClaimInvitePage.jsx`**

```jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db, claimEvaluatorInvite } from "../firebase";
import badge from "../assets/gfd-badge.png";

/** Public, no-login page reached by scanning the QR (or opening the fallback invite email
 * link) AddEvaluatorWizard.jsx generates. Shows the invited email, collects the
 * evaluator's own new password, and claims the account. See
 * docs/superpowers/specs/2026-08-06-evaluator-wizard-design.md. */
export default function ClaimInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState("loading"); // loading | invalid | ready | claiming
  const [invite, setInvite] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getDoc(doc(db, "evaluatorInvites", token))
      .then((snap) => {
        if (!snap.exists() || snap.data().used || snap.data().expiresAt.toDate() < new Date()) {
          setPhase("invalid");
          return;
        }
        setInvite(snap.data());
        setPhase("ready");
      })
      .catch(() => setPhase("invalid"));
  }, [token]);

  async function handleClaim() {
    setPhase("claiming");
    setError("");
    try {
      await claimEvaluatorInvite(token, newPassword);
      navigate("/login", { replace: true });
    } catch (err) {
      setPhase("ready");
      setError(
        err.code === "invite/used" || err.code === "invite/expired" || err.code === "invite/not-found"
          ? "This invite has expired or already been used. Ask your administrator for a new one."
          : "Something went wrong. Try again."
      );
    }
  }

  if (phase === "loading") {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading invite…</div>;
  }

  if (phase === "invalid") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
        <p className="muted" style={{ maxWidth: 320, textAlign: "center" }}>
          This invite has expired or already been used. Ask your administrator for a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="screen center-column" style={{ paddingTop: 32 }}>
      <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
      <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>Set Your Password</h2>
      <p className="muted" style={{ maxWidth: 320, textAlign: "center" }}>{invite.email}</p>

      <div style={{ width: "100%", maxWidth: 320, marginTop: 16 }}>
        <div className="field">
          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="6+ characters"
          />
        </div>
        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
        <button
          className="primary"
          style={{ width: "100%", marginTop: 8 }}
          disabled={newPassword.length < 6 || phase === "claiming"}
          onClick={handleClaim}
        >
          {phase === "claiming" ? "Setting Password…" : "Set Password & Continue"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the route in `web/src/App.jsx`**

Add the import (currently line 40, after `LiveDashboardPage`):

```jsx
import LiveDashboardPage from "./pages/LiveDashboardPage";
import ClaimInvitePage from "./pages/ClaimInvitePage";
```

Add the route (currently line 112, right after `/live/:token`):

```jsx
      <Route path="/live/:token" element={<LiveDashboardPage />} />
      <Route path="/claim/:token" element={<ClaimInvitePage />} />
```

- [ ] **Step 5: Confirm the wiring**

```bash
cd web && grep -n "claimEvaluatorInvite" src/firebase.js; grep -n "ClaimInvitePage" src/App.jsx
```

Expected: first command finds the export (at minimum); second finds the import and the route, 2 matches.

- [ ] **Step 6: Build clean**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add web/src/firebase.js web/src/pages/ClaimInvitePage.jsx web/src/App.jsx && git commit -m "$(cat <<'EOF'
feat: add the evaluator invite claim flow

claimEvaluatorInvite() (firebase.js) signs in with the system temp
password on a throwaway secondary Firebase App, sets the evaluator's
chosen password, clears mustChangePassword, and marks the invite
used — never touching the primary auth session, so it can't disrupt
an admin's own login sharing the same browser. ClaimInvitePage.jsx
(new public /claim/:token route) is the one UI that calls it.
EOF
)"
```

---

### Task 6: `NewUserModal` becomes admin-only

**Files:**
- Modify: `web/src/pages/AdminsPage.jsx` (the `NewUserModal` function, currently lines 226–367, plus its trigger button)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for other files — this is the last code task.

- [ ] **Step 1: Confirm the current role picker**

```bash
cd web && grep -n 'useState("evaluator")\|"New User"\|"\\+ Add User"' src/pages/AdminsPage.jsx
```

Expected: finds `const [role, setRole] = useState("evaluator");`, the `<h3 style={{ marginTop: 0 }}>New User</h3>` heading, and the `+ Add User` button text.

- [ ] **Step 2: Remove the role picker and `role` state from `NewUserModal`**

Change the top of `NewUserModal` (currently lines 226–237) from:

```jsx
function NewUserModal({ onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("evaluator");
  const [notifyOnFailures, setNotifyOnFailures] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // null while filling out the form; { email, password, welcomeStatus } once the account
  // exists — the modal switches to a confirmation view so the admin can see whether the
  // welcome email went out, and if not, still has the temp password on screen to relay.
  const [created, setCreated] = useState(null);
```

to:

```jsx
function NewUserModal({ onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notifyOnFailures, setNotifyOnFailures] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // null while filling out the form; { email, password, welcomeStatus } once the account
  // exists — the modal switches to a confirmation view so the admin can see whether the
  // welcome email went out, and if not, still has the temp password on screen to relay.
  const [created, setCreated] = useState(null);
```

- [ ] **Step 3: Hardcode `role: "admin"` in `handleCreate`**

Change (currently lines 246–252):

```jsx
      const uid = await createUserAccountWithoutSigningIn(trimmedEmail, password);
      await setDoc(doc(db, "admins", uid), {
        email: trimmedEmail,
        displayName,
        role,
        isActive: true,
        notifyOnFailures: role === "admin" ? notifyOnFailures : false,
        createdAt: new Date(),
        mustChangePassword: true,
      });
```

to:

```jsx
      const uid = await createUserAccountWithoutSigningIn(trimmedEmail, password);
      await setDoc(doc(db, "admins", uid), {
        email: trimmedEmail,
        displayName,
        role: "admin",
        isActive: true,
        notifyOnFailures,
        createdAt: new Date(),
        mustChangePassword: true,
      });
```

- [ ] **Step 4: Remove the role picker UI, rename the heading, and always show `notifyOnFailures`**

Change (currently lines 300–355):

```jsx
      <div className="card" style={{ width: 340, background: "white", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>New User</h3>

        <div className="field">
          <label>Role</label>
          <div className="segmented">
            {[
              ["evaluator", "Evaluator"],
              ["admin", "Admin"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`segment${role === value ? " active" : ""}`}
                onClick={() => setRole(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            {role === "evaluator"
              ? "Can run tests and submit results. Cannot edit recruits, tests, or other users."
              : "Full access: can build tests, manage recruits, run reports, and manage users."}
          </p>
        </div>

        <div className="field">
          <label>Full Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Temporary Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {role === "admin" && (
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
              <input
                type="checkbox"
                checked={notifyOnFailures}
                onChange={(e) => setNotifyOnFailures(e.target.checked)}
                style={{ width: "auto", margin: 0 }}
              />
              Notify with failures
            </label>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Email this admin whenever a recruit fails a test.
            </p>
          </div>
        )}
```

to:

```jsx
      <div className="card" style={{ width: 340, background: "white", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>New Administrator</h3>

        <div className="field">
          <label>Full Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Temporary Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={notifyOnFailures}
              onChange={(e) => setNotifyOnFailures(e.target.checked)}
              style={{ width: "auto", margin: 0 }}
            />
            Notify with failures
          </label>
          <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
            Email this admin whenever a recruit fails a test.
          </p>
        </div>
```

- [ ] **Step 5: Rename the trigger button**

Change (Task 4 already restructured this into a flex row — the button text itself is what changes here):

```jsx
          <button className="primary" style={{ width: "auto" }} onClick={() => setShowNewUser(true)}>
            + Add User
          </button>
```

to:

```jsx
          <button className="primary" style={{ width: "auto" }} onClick={() => setShowNewUser(true)}>
            + Add Administrator
          </button>
```

- [ ] **Step 6: Confirm the role picker is gone and the rename landed**

```bash
cd web && grep -c 'useState("evaluator")\|"Role"\|segment\${role' src/pages/AdminsPage.jsx; grep -n '"New Administrator"\|"\\+ Add Administrator"' src/pages/AdminsPage.jsx
```

Expected: first command prints `0`; second finds two matches.

- [ ] **Step 7: Build clean**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/AdminsPage.jsx && git commit -m "$(cat <<'EOF'
feat: make NewUserModal admin-only

Evaluator creation moved entirely to AddEvaluatorWizard.jsx (Task
4). NewUserModal drops its role picker and always creates
Administrator accounts; the Notify with failures checkbox (always
admin-only) is now always shown instead of conditionally. Renamed
"New User" -> "New Administrator" and "+ Add User" -> "+ Add
Administrator" to match. The role filter and account list
(ROLE_FILTERS/ROLE_LABELS) are untouched — both roles still list
together exactly as before.
EOF
)"
```

---

### Task 7: End-to-end browser verification, then push

**Files:** none — verification only, using the app's existing local sandbox harness (per `docs/superpowers/specs/2026-07-28-local-emulator-sandbox-design.md`), same approach as the prior three plans' final tasks.

**Interfaces:** none.

- [ ] **Step 1: Build clean one more time from the full set of changes**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 2: Drive the actual app in a browser and confirm the full design-spec testing checklist**

Use the project's `web:verify` skill (or manually run `npm run dev:sandbox` with seeded data via `npm run seed:sandbox`, and `npm run emulators` for the Firestore/Auth emulators the rules changes need to be live-tested against) to walk through:

1. As an admin, open "+ Add Evaluator", fill in email/name, leave auto-deactivate
   unchecked → submit → QR code renders, invite-email attempt shows its status.
2. Open the QR's encoded link (`/claim/{token}`) in a second, unauthenticated
   browser context (a fresh incognito window, not just a new tab — Firebase Auth
   persists in IndexedDB and would otherwise carry over) → claim page shows the
   correct email, accepts a new password → submits → redirected to `/login`.
3. Log in with the new password → succeeds, lands on the evaluator's normal home
   screen (not forced into a password-change screen again — `mustChangePassword`
   was cleared).
4. Reload the same claim link after step 2 → shows the used/expired message, no way
   to reclaim.
5. Create a second evaluator with auto-deactivate checked → inspect the raw
   Firestore emulator data for that account's `autoDeactivateAt` — confirm it's
   today at 18:00 local time (or tomorrow, if this step happens to run after 6pm).
6. In the Firestore emulator, manually edit that account's `autoDeactivateAt` to a
   past timestamp → attempt any Firestore read/write as that account (e.g. try to
   sign in as them and load `/` ) → confirm it's denied by the rules (not just
   hidden by the UI).
7. As an admin, reload `/admins` → confirm the account from step 6 now shows as
   inactive (the lazy sweep flipped it), without anyone clicking Deactivate
   manually.
8. Open "+ Add Administrator" (renamed from "+ Add User") → confirm no role picker,
   `notifyOnFailures` checkbox always visible, creates an admin account exactly as
   the old flow did for that role, and that account can log in normally.
9. Confirm the role filter ("All"/"Admins"/"Evaluators") and account list on
   `/admins` are unaffected — both roles the branch created still show up there
   correctly, with the right badges.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin HEAD
```

Expected: pushes all commits from Tasks 1–6 to a new remote branch (first push on this branch — use `-u` to set upstream, matching this repo's convention of local `worktree-*` branches pushing to an identically-named remote branch).
