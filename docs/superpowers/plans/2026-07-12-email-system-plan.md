# Email System: Practice-Recruit Failure Emails + Welcome Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirm (and guard) that failure-notification emails already fire correctly for practice-recruit test runs, and add a new best-effort "welcome email" (login + temporary password) whenever a new staff or recruit-portal login is created.

**Architecture:** No new services. Failure-email guard is a verification + one clarifying comment, no behavior change. Welcome email reuses the existing free EmailJS-from-the-browser pattern already used for failure notifications (`web/src/lib/notify.js`), with its own EmailJS template id, wired into the two places a login is created today (`AdminsPage.jsx`, `RecruitsAdminPage.jsx`).

**Tech Stack:** React 18 + Vite, Firebase (Auth + Firestore client SDK), EmailJS REST API (`https://api.emailjs.com/api/v1.0/email/send`) called directly from the browser — no backend.

## Global Constraints

- This repo has **no unit test framework** (`web/package.json` has no `vitest`/`jest`, no `test` script). Verification in this plan means: (1) `npm run build` in `web/` compiles cleanly, and (2) driving the real UI through the emulator + Playwright harness documented in `web/.claude/skills/verify/SKILL.md`. Do not invent a test runner that isn't installed.
- EmailJS calls a real external HTTP API. The emulator/sandboxed environment will not have `VITE_EMAILJS_*` env vars set, so automatic sends in that environment always resolve to `"not-configured"` — verification steps assert on that status value and on the app's own UI messaging, never on an email actually arriving in an inbox.
- Welcome-email sending must be **best-effort**: it must never throw in a way that blocks account creation, matching the existing `sendFailureEmail` contract (`web/src/lib/notify.js:127-161`) of always resolving to a `{ status, error }` object.
- Every new/changed piece of UI copy must match this app's existing tone (`web/src/pages/reporting/ReportingHomePage.jsx`, `AdminsPage.jsx`, etc. use plain, direct wording — no exclamation points, no "Oops!").

---

### Task 1: Guard comment for practice-recruit failure emails (#2)

**Files:**
- Modify: `web/src/pages/LiveTestRunnerPage.jsx:269-277`

**Interfaces:**
- Consumes: nothing new — `sendFailureEmail(finishedSession, results)` already imported at `web/src/pages/LiveTestRunnerPage.jsx:17`.
- Produces: nothing new for later tasks.

This task makes no behavior change — static reading of `finishSession()` confirms there is no `isPractice` check anywhere between the FAIL determination and the `sendFailureEmail()` call, so a practice-recruit failure already emails the same way a real recruit's does. The task is to (a) add a comment that documents this on purpose, so a future edit doesn't "fix" it by accident, and (b) prove it with a real run through the emulator harness.

- [ ] **Step 1: Add the guard comment**

Open `web/src/pages/LiveTestRunnerPage.jsx` and replace the comment block at lines 269-277:

```jsx
    // On a failure, email the admins who opted into failure notifications. Best-effort:
    // a failed/unconfigured send never blocks the evaluator — the Results screen shows
    // the outcome and offers a manual compose button as backup. Recipients are resolved
    // once here and stored, so the Results screen never re-queries them (a second query
    // could come back empty and wrongly claim no one is subscribed).
    //
    // Intentionally NOT gated on sessionData.isPractice: a failed practice-recruit run is
    // exactly when an evaluator is most likely to be testing this notification pipeline
    // itself, so it must behave identically to a real recruit's failure. Do not add an
    // isPractice skip here — practice-recruit sessions are already excluded from every
    // reporting/history view (CohortDashboardPage, RecruitHistoryListPage, ExportPage,
    // reportsData.js), which is the correct place for that exclusion, not this send.
    let failureEmail = { status: null, recipients: [], error: null };
    if (overallResult === RESULT.FAIL) {
      failureEmail = await sendFailureEmail(finishedSession, results);
    }
```

- [ ] **Step 2: Compile check**

Run: `cd web && npm run build`
Expected: build succeeds with no errors (comment-only change, but confirms nothing else broke first).

- [ ] **Step 3: Verify against a real practice-recruit FAIL via the emulator harness**

Follow `web/.claude/skills/verify/SKILL.md` to start the Firestore/Auth emulators and the dev server, and seed the one admin doc as shown there. Then seed a second admin doc that has opted into failure notifications, so `fetchNotifyRecipients()` (`web/src/lib/notify.js:34-41`) finds someone — without this, `sendFailureEmail` would short-circuit to `"no-recipients"` regardless of the practice-recruit question, and the check below wouldn't prove anything:

```bash
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$TESTUID" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"verify.admin@example.com"},"displayName":{"stringValue":"Verify Admin"},"role":{"stringValue":"admin"},"isActive":{"booleanValue":true},"notifyOnFailures":{"booleanValue":true}}}'
```

Using Playwright against the running dev server (pointed at the emulator per the verify skill), log in as `verify.admin@example.com` / `VerifyBot!2026`, go to Home, start a test against the **Practice Recruit** entry (seeded automatically by the test picker — see `web/src/lib/practiceRecruit.js`), and grade every graded step FAIL so the session finishes with `overallResult: "FAIL"`.

After the run finishes, read the session doc back to confirm the email pipeline executed for this practice run:

```bash
curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents:runQuery" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"structuredQuery":{"from":[{"collectionId":"sessions"}],"where":{"fieldFilter":{"field":{"fieldPath":"isPractice"},"op":"EQUAL","value":{"booleanValue":true}}},"orderBy":[{"field":{"fieldPath":"startedAt"},"direction":"DESCENDING"}],"limit":1}}'
```

Expected: the returned session document has `failureEmailStatus: "not-configured"` (proving `fetchNotifyRecipients()` found the seeded admin and the send was attempted — it only reads `"not-configured"` instead of `"sent"` because this environment has no real `VITE_EMAILJS_*` values, which is expected and correct) and **not** `"no-recipients"` (which would mean the recipient lookup itself failed or was skipped) and **not** `null` (which would mean the whole block was skipped, e.g. by a stray `isPractice` guard). This is the concrete proof that practice-recruit failures are not excluded from the failure-email path.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/LiveTestRunnerPage.jsx
git commit -m "Document that practice-recruit failures intentionally still trigger failure emails"
```

---

### Task 2: Add `sendWelcomeEmail` to `notify.js` (#9)

**Files:**
- Modify: `web/src/lib/notify.js`
- Modify: `web/.env.example`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 3 and 4):
  - `isWelcomeEmailConfigured(): boolean`
  - `buildWelcomeSubject(): string`
  - `buildWelcomeBody({ toName: string, loginEmail: string, tempPassword: string }): string`
  - `sendWelcomeEmail({ toEmail: string, toName: string, loginEmail: string, tempPassword: string }): Promise<{ status: "sent" | "not-configured" | "failed", error: string | null }>`

- [ ] **Step 1: Add the new EmailJS template env var**

Append to `web/.env.example` (after the existing `VITE_EMAILJS_*` block):

```
# --- Optional: automatic welcome emails on new user/recruit-login creation (free) ---
# Uses the same EmailJS account as above. Create a SECOND Email Template (different
# content than the failure-report one) with:
#   To Email:  {{to_email}}
#   Subject:   {{subject}}
#   Content:   {{message}}
# -> copy its Template ID here. Without this, new accounts still work fine — the
# admin who created the account just sees the login/password on screen to share
# manually instead of an automatic email going out.
VITE_EMAILJS_WELCOME_TEMPLATE_ID=
```

- [ ] **Step 2: Add the welcome-email functions to `notify.js`**

Add these exports to `web/src/lib/notify.js`, right after the existing `EMAILJS_PUBLIC_KEY`/`isEmailConfigured` block (after line 25):

```js
const EMAILJS_WELCOME_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_WELCOME_TEMPLATE_ID;

export function isWelcomeEmailConfigured() {
  return Boolean(EMAILJS_SERVICE_ID && EMAILJS_WELCOME_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);
}

export function buildWelcomeSubject() {
  return "Your GFD Recruit Testing login";
}

/** Plain-text welcome message: who this is for, their login, and their temporary
 * password. Mirrors buildFailureBody's shape (plain text, used directly as the EmailJS
 * "message" template variable). */
export function buildWelcomeBody({ toName, loginEmail, tempPassword }) {
  const lines = [];
  lines.push(`Hi ${toName},`);
  lines.push("");
  lines.push("You've been given a login for GFD Recruit Testing.");
  lines.push("");
  lines.push(`Login email: ${loginEmail}`);
  lines.push(`Temporary password: ${tempPassword}`);
  lines.push("");
  lines.push(
    'We recommend changing your password after you sign in — use "Forgot Password" on the login screen any time.'
  );
  lines.push("");
  lines.push(`Sign in here: ${window.location.origin}/login`);
  return lines.join("\n");
}

/**
 * Attempts automatic delivery of a welcome email via EmailJS, using a separate template
 * from the failure-report one (unrelated content). Best-effort, same contract as
 * sendFailureEmail: never throws, always resolves to { status, error }.
 *   "sent"             emailed successfully
 *   "not-configured"   EmailJS (or the welcome template specifically) not set up —
 *                      caller should show the login/password on screen for manual sharing
 *   "failed"           the send call errored — same manual-sharing fallback as above
 */
export async function sendWelcomeEmail({ toEmail, toName, loginEmail, tempPassword }) {
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
          subject: buildWelcomeSubject(),
          message: buildWelcomeBody({ toName, loginEmail, tempPassword }),
        },
      }),
    });
    if (res.ok) return { status: "sent", error: null };
    const detail = await res.text().catch(() => "");
    console.error("EmailJS welcome send failed", res.status, detail);
    return { status: "failed", error: `EmailJS ${res.status}${detail ? `: ${detail}` : ""}` };
  } catch (err) {
    console.error("EmailJS welcome send threw", err);
    return { status: "failed", error: err?.message ?? "network error" };
  }
}
```

- [ ] **Step 3: Compile check**

Run: `cd web && npm run build`
Expected: build succeeds — this is a pure addition, nothing else imports these functions yet.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/notify.js web/.env.example
git commit -m "Add sendWelcomeEmail alongside the existing failure-notification email helpers"
```

---

### Task 3: Wire welcome email into new staff-account creation (#9)

**Files:**
- Modify: `web/src/pages/AdminsPage.jsx`

**Interfaces:**
- Consumes: `sendWelcomeEmail` from Task 2 (`web/src/lib/notify.js`).
- Produces: nothing consumed by later tasks (Task 4 is independent).

- [ ] **Step 1: Import `sendWelcomeEmail`**

Add to the top of `web/src/pages/AdminsPage.jsx` (alongside the existing imports):

```jsx
import { sendWelcomeEmail } from "../lib/notify";
```

- [ ] **Step 2: Replace `NewUserModal` with a version that sends the welcome email and shows the outcome**

Replace the entire `NewUserModal` function (`web/src/pages/AdminsPage.jsx:234-347`) with:

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

  const canSubmit = displayName && email && password.length >= 6;

  async function handleCreate() {
    setSubmitting(true);
    setError("");
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const uid = await createUserAccountWithoutSigningIn(trimmedEmail, password);
      await setDoc(doc(db, "admins", uid), {
        email: trimmedEmail,
        displayName,
        role,
        isActive: true,
        notifyOnFailures: role === "admin" ? notifyOnFailures : false,
        createdAt: new Date(),
      });
      setCreated({ email: trimmedEmail, password, welcomeStatus: "sending" });
      const result = await sendWelcomeEmail({
        toEmail: trimmedEmail,
        toName: displayName,
        loginEmail: trimmedEmail,
        tempPassword: password,
      });
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
        <div className="card" style={{ width: 340, background: "white" }}>
          <h3 style={{ marginTop: 0 }}>User Created</h3>
          <p style={{ margin: "0 0 8px" }}>{created.email}</p>
          {created.welcomeStatus === "sending" && <p className="muted">Sending welcome email…</p>}
          {created.welcomeStatus === "sent" && <p className="muted">Welcome email sent to {created.email}.</p>}
          {(created.welcomeStatus === "not-configured" || created.welcomeStatus === "failed") && (
            <p className="muted">
              Welcome email not sent — share the login email and temporary password (
              <strong>{created.password}</strong>) with them manually.
            </p>
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
        <h3 style={{ marginTop: 0 }}>New User</h3>

        <div className="field">
          <label>Role</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["evaluator", "Evaluator"],
              ["admin", "Admin"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: role === value ? "var(--brand-navy)" : "white",
                  color: role === value ? "white" : "var(--text)",
                  cursor: "pointer",
                }}
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

        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canSubmit || submitting} onClick={handleCreate}>
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Compile check**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify via the emulator + Playwright harness**

Start the emulator/dev-server harness per `web/.claude/skills/verify/SKILL.md`. Log in as the seeded admin, go to Users (`/admins`), click "+ Add User", fill in a name/email/6+ character password, click "Create". Since this environment has no `VITE_EMAILJS_WELCOME_TEMPLATE_ID` set, expect the confirmation view to show "User Created" with the "Welcome email not sent — share the login email and temporary password (…) with them manually." message and a "Done" button. Click "Done" and confirm the modal closes and the new user appears in the list. Also confirm in the Firestore emulator (`curl http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/<new-uid>` with the owner bearer token) that the `admins` doc was written correctly regardless of the email outcome — account creation must never be blocked by the email step.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/AdminsPage.jsx
git commit -m "Send a welcome email when a new staff account is created"
```

---

### Task 4: Wire welcome email into new recruit-portal-login creation (#9)

**Files:**
- Modify: `web/src/pages/RecruitsAdminPage.jsx`

**Interfaces:**
- Consumes: `sendWelcomeEmail` from Task 2 (`web/src/lib/notify.js`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import `sendWelcomeEmail`**

Add to the top of `web/src/pages/RecruitsAdminPage.jsx` (alongside the existing imports):

```jsx
import { sendWelcomeEmail } from "../lib/notify";
```

- [ ] **Step 2: Add welcome-status state to `RecruitFormModal`**

In `RecruitFormModal` (`web/src/pages/RecruitsAdminPage.jsx:132-143`), add one more state variable alongside the existing ones:

```jsx
  const [welcomeStatus, setWelcomeStatus] = useState(null); // null, "sending", "sent", "not-configured", or "failed" — only ever set when a new portal login is created in this save
```

- [ ] **Step 3: Send the welcome email from `handleSave`, and stay open to show the result**

Replace `handleSave` (`web/src/pages/RecruitsAdminPage.jsx:156-200`) with:

```jsx
  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const data = {
        firstName,
        lastName,
        recruitClassOrCohort: cohort,
        badgeOrIdNumber: badgeNumber || null,
        isActive: true,
      };

      let recruitId = recruit.id;
      if (isNew) {
        data.createdAt = new Date();
        const created = await addDoc(collection(db, "recruits"), data);
        recruitId = created.id;
      } else {
        await updateDoc(doc(db, "recruits", recruitId), data);
      }

      if (photoFile) {
        const dataUrl = await compressImageToDataUrl(photoFile);
        await updateDoc(doc(db, "recruits", recruitId), { photoURL: dataUrl });
      }

      if (wantsNewLogin) {
        const trimmedLoginEmail = loginEmail.trim().toLowerCase();
        const uid = await createUserAccountWithoutSigningIn(trimmedLoginEmail, loginPassword);
        await setDoc(doc(db, "admins", uid), {
          email: trimmedLoginEmail,
          displayName: `${firstName} ${lastName}`,
          role: "recruit",
          recruitId,
          isActive: true,
          createdAt: new Date(),
        });
        setWelcomeStatus("sending");
        const result = await sendWelcomeEmail({
          toEmail: trimmedLoginEmail,
          toName: `${firstName} ${lastName}`,
          loginEmail: trimmedLoginEmail,
          tempPassword: loginPassword,
        });
        setWelcomeStatus(result.status);
        return; // stay open so the admin sees the welcome-email outcome below; they close it themselves
      }

      onClose();
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "That email is already registered." : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 4: Render the welcome-email outcome and swap the footer buttons**

In the same component's returned JSX, replace the closing button row (`web/src/pages/RecruitsAdminPage.jsx:274-281`, the `{error && ...}` paragraph plus the Cancel/Save `<div>`) with:

```jsx
        {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}

        {welcomeStatus && (
          <div className="field">
            {welcomeStatus === "sending" && <p className="muted">Sending welcome email…</p>}
            {welcomeStatus === "sent" && (
              <p className="muted">Welcome email sent to {loginEmail.trim().toLowerCase()}.</p>
            )}
            {(welcomeStatus === "not-configured" || welcomeStatus === "failed") && (
              <p className="muted">
                Welcome email not sent — share the login email and temporary password (
                <strong>{loginPassword}</strong>) with them manually.
              </p>
            )}
          </div>
        )}

        {welcomeStatus ? (
          <button className="primary" style={{ width: "100%" }} disabled={welcomeStatus === "sending"} onClick={onClose}>
            Done
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={!canSave || saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
```

- [ ] **Step 5: Compile check**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Verify via the emulator + Playwright harness**

Using the same running harness from Task 3, go to Manage Recruits (`/recruits`), click "+ Add Recruit", fill in first/last name and cohort, then in the "Portal Login (optional)" section enter an email and a 6+ character password, and click "Save". Expect the modal to stay open (not close) and show "Welcome email not sent — share the login email and temporary password (…) with them manually." with a single "Done" button (this environment has no welcome-email template configured). Click "Done", confirm the modal closes and the new recruit's tile shows "Portal login: <email>". As a contrast case, add a second recruit **without** filling in the Portal Login fields and confirm `handleSave` still closes the modal immediately (no welcome-email UI appears) — proving the new code path is only reached when a login is actually being created, not on every save.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/RecruitsAdminPage.jsx
git commit -m "Send a welcome email when a new recruit portal login is created"
```

---

## Self-Review Notes

- **Spec coverage:** #2 (Task 1: verified no code change needed, guard comment + emulator proof added) and #9 (Tasks 2-4: `sendWelcomeEmail`/`buildWelcomeBody` added, wired into both login-creation sites listed in the spec's "Files touched" section) are both covered. All five files named in the spec's "Files touched" list are touched: `notify.js` (Task 2), `AdminsPage.jsx` (Task 3), `RecruitsAdminPage.jsx` (Task 4), `.env.example` (Task 2), `LiveTestRunnerPage.jsx` (Task 1).
- **Placeholder scan:** no TBD/TODO markers; every step has complete, final code.
- **Type consistency:** `sendWelcomeEmail({ toEmail, toName, loginEmail, tempPassword })` signature (defined Task 2) is called identically in Task 3 and Task 4. `welcomeStatus`/`created.welcomeStatus` string values (`"sending"`, `"sent"`, `"not-configured"`, `"failed"`) match the values `sendWelcomeEmail` actually resolves to.
- **Scope:** all four tasks are independently testable (each ends with its own build + emulator verification) and each is small enough for a single review pass.
