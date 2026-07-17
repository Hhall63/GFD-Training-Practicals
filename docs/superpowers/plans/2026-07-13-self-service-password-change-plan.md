# Self-Service Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any signed-in user change their own password from the account dropdown menu, and force accounts created with an admin-assigned temp password to change it on their first login.

**Architecture:** A new `changeOwnPassword(currentPassword, newPassword)` function in `AuthContext.jsx` reauthenticates and calls Firebase's `updatePassword`, then clears a `mustChangePassword` Firestore flag (and local state) if one was set. A single reusable `ChangePasswordForm.jsx` component drives two entry points: a voluntary "Change Password" item in `TopBar.jsx`'s dropdown, and a mandatory full-screen `ForceChangePasswordPage.jsx` that `App.jsx`'s `RequireAuth` renders instead of any route while `adminDoc.mustChangePassword` is true.

**Tech Stack:** React (function components + hooks), Firebase Auth (`reauthenticateWithCredential`, `updatePassword`) + Firestore (`updateDoc`), Firestore Security Rules. No JS test framework is configured in `web/` — verification is done by driving the running app via this repo's `web:verify` skill (Firebase emulator + curl/Playwright), matching the convention already used for prior plans in this repo.

## Global Constraints

- No email is sent by this feature. `template_lcadj6p` is not used anywhere in this plan (see the design spec's "Explicitly out of scope" section for why).
- Do not touch `LoginPage.jsx`'s "Forgot Password?", `AdminsPage.jsx`/`RecruitsAdminPage.jsx`'s admin-initiated "Reset Password" buttons for *other* users, or `AuthContext.requestPasswordReset` — all out of scope, unchanged.
- Do not touch `SetupAdminPage.jsx` or retroactively set `mustChangePassword` on any existing account — only newly created accounts (after this ships) get the flag.
- New password minimum length is 6 characters, matching the existing convention in `NewUserModal`/`SetupAdminPage` (`password.length >= 6`).
- Firestore rules change must be as narrow as possible: a signed-in user may update *only* the `mustChangePassword` field on *their own* `admins` doc, and only to `false`. No other field becomes self-editable.

---

### Task 1: Firestore rule — self-service `mustChangePassword` clear

**Files:**
- Modify: `web/firestore.rules:76`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the Firestore write permission that Task 2's `changeOwnPassword` depends on. Without this task, Task 2's Firestore write will fail with `permission-denied` for any non-admin account.

- [ ] **Step 1: Update the `admins/{adminId}` rule**

In `web/firestore.rules`, the current rule at line 76 is:

```
      allow update, delete: if isAdminRole();
```

Replace it with:

```
      allow update: if isAdminRole()
        || (isSignedIn()
            && request.auth.uid == adminId
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['mustChangePassword'])
            && request.resource.data.mustChangePassword == false);
      allow delete: if isAdminRole();
```

- [ ] **Step 2: Start the Firestore/Auth emulators**

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training > /tmp/emulators.log 2>&1 &
```

Wait for readiness (poll, don't sleep-guess):

```bash
for i in $(seq 1 30); do curl -s http://127.0.0.1:8080 > /dev/null && break; sleep 1; done
curl -s http://127.0.0.1:8080 > /dev/null && echo "Firestore emulator up" || (cat /tmp/emulators.log && exit 1)
```

Expected: "Firestore emulator up" (also confirms the rules file has no syntax error — the emulator refuses to start if `firestore.rules` doesn't compile, and the log would show a rules compilation error instead).

- [ ] **Step 3: Seed a non-admin test account**

```bash
EVALUID=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"email":"rules.evaluator@example.com","password":"RulesTest!2026","returnSecureToken":true}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).localId))")

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$EVALUID" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"rules.evaluator@example.com"},"displayName":{"stringValue":"Rules Evaluator"},"role":{"stringValue":"evaluator"},"isActive":{"booleanValue":true},"mustChangePassword":{"booleanValue":true}}}'

EVALTOKEN=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"email":"rules.evaluator@example.com","password":"RulesTest!2026","returnSecureToken":true}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).idToken))")

echo "uid=$EVALUID"
```

Expected: `uid=` prints a non-empty Firestore document id.

- [ ] **Step 4: Verify the allowed self-write succeeds**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
  "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$EVALUID?updateMask.fieldPaths=mustChangePassword" \
  -H "Authorization: Bearer $EVALTOKEN" -H "Content-Type: application/json" \
  -d '{"fields":{"mustChangePassword":{"booleanValue":false}}}'
```

Expected: `200`

- [ ] **Step 5: Verify a disallowed self-write (privilege escalation) is rejected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
  "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$EVALUID?updateMask.fieldPaths=role" \
  -H "Authorization: Bearer $EVALTOKEN" -H "Content-Type: application/json" \
  -d '{"fields":{"role":{"stringValue":"admin"}}}'
```

Expected: `403`

- [ ] **Step 6: Verify a multi-field self-write (even including `mustChangePassword`) is rejected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
  "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$EVALUID?updateMask.fieldPaths=mustChangePassword&updateMask.fieldPaths=isActive" \
  -H "Authorization: Bearer $EVALTOKEN" -H "Content-Type: application/json" \
  -d '{"fields":{"mustChangePassword":{"booleanValue":false},"isActive":{"booleanValue":false}}}'
```

Expected: `403`

- [ ] **Step 7: Verify setting `mustChangePassword` to `true` (not `false`) is rejected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
  "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$EVALUID?updateMask.fieldPaths=mustChangePassword" \
  -H "Authorization: Bearer $EVALTOKEN" -H "Content-Type: application/json" \
  -d '{"fields":{"mustChangePassword":{"booleanValue":true}}}'
```

Expected: `403`

- [ ] **Step 8: Stop the emulators**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 9: Commit**

```bash
git add web/firestore.rules
git commit -m "feat: allow self-service clearing of mustChangePassword in Firestore rules"
```

---

### Task 2: Voluntary "Change Password" from the account dropdown

**Files:**
- Modify: `web/src/context/AuthContext.jsx:1-9` (imports), and add `changeOwnPassword` after `requestPasswordReset` (currently `AuthContext.jsx:112-116`), and expose it in the context value (currently `AuthContext.jsx:139-160`).
- Create: `web/src/components/ChangePasswordForm.jsx`
- Modify: `web/src/components/TopBar.jsx`

**Interfaces:**
- Consumes: Task 1's Firestore rule (the `updateDoc` inside `changeOwnPassword` needs it to succeed for non-admin accounts); `useAuth()`'s existing `adminDoc`/`auth.currentUser` shape (`{ id, email, displayName, role, isActive, mustChangePassword?, ... }`, matching every other doc read in this file, e.g. `AdminsPage.jsx`).
- Produces: `changeOwnPassword(currentPassword: string, newPassword: string): Promise<void>` on the `useAuth()` context value — thrown errors carry Firebase's `err.code` (e.g. `"auth/wrong-password"`), same contract as `login`/`requestPasswordReset`. `ChangePasswordForm` component with props `{ onSuccess: () => void, onCancel?: () => void }` — omitting `onCancel` hides the Cancel button (used by Task 3's forced-gate page, which reuses this exact component).

- [ ] **Step 1: Add the reauthenticate/updatePassword imports**

In `web/src/context/AuthContext.jsx`, change the `firebase/auth` import block (lines 2-7):

```js
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";
```

to:

```js
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
```

- [ ] **Step 2: Add `changeOwnPassword`**

In `web/src/context/AuthContext.jsx`, directly below the existing `requestPasswordReset` function (lines 112-116):

```js
  /** Self-service password reset via a real emailed link — possible because accounts use
   * real email addresses. */
  async function requestPasswordReset(email) {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  }
```

add:

```js

  /** Self-service password change for an already-signed-in user: verifies the current
   * password via reauthentication (Firebase's updatePassword throws requires-recent-login
   * otherwise), then sets the new one. If this account had a pending forced first-login
   * change, clears that flag both in Firestore and in local state — adminDoc comes from a
   * one-time getDoc, not a live listener (see the effect above), so the flag wouldn't
   * otherwise update until the next sign-in. */
  async function changeOwnPassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    if (adminDoc?.mustChangePassword) {
      await updateDoc(doc(db, "admins", user.uid), { mustChangePassword: false });
      setAdminDoc((d) => (d ? { ...d, mustChangePassword: false } : d));
    }
  }
```

- [ ] **Step 3: Expose it on the context value**

In `web/src/context/AuthContext.jsx`, change the provider value (lines 139-157):

```jsx
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
```

to:

```jsx
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
        changeOwnPassword,
        createFirstAdmin,
      }}
```

- [ ] **Step 4: Create `ChangePasswordForm.jsx`**

Create `web/src/components/ChangePasswordForm.jsx`:

```jsx
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import FormAlert from "./FormAlert";

function mapError(err) {
  const code = err?.code;
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
    return "Current password is incorrect.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (code === "auth/weak-password") {
    return "Choose a password with at least 6 characters.";
  }
  return "Something went wrong. Try again.";
}

/** Shared by the voluntary "Change Password" dropdown modal (TopBar.jsx) and the mandatory
 * first-login gate (ForceChangePasswordPage.jsx) — pass onCancel to show a Cancel button,
 * omit it to hide one (the forced gate has no way to skip). */
export default function ChangePasswordForm({ onSuccess, onCancel }) {
  const { changeOwnPassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const validationError =
    newPassword.length > 0 && newPassword.length < 6
      ? "New password must be at least 6 characters."
      : newPassword && currentPassword && newPassword === currentPassword
      ? "New password must be different from your current password."
      : confirmPassword && confirmPassword !== newPassword
      ? "Passwords don't match."
      : "";

  const canSubmit =
    currentPassword && newPassword.length >= 6 && confirmPassword === newPassword && newPassword !== currentPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await changeOwnPassword(currentPassword, newPassword);
      onSuccess();
    } catch (err) {
      setError(mapError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <FormAlert variant="error">{error}</FormAlert>}
      <div className="field">
        <label htmlFor="change-pw-current">Current Password</label>
        <input
          id="change-pw-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="change-pw-new">New Password</label>
        <input
          id="change-pw-new"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="change-pw-confirm">Confirm New Password</label>
        <input
          id="change-pw-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {validationError && !error && (
        <p style={{ color: "var(--brand-red)", fontSize: 13, margin: "0 0 12px" }}>{validationError}</p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
        <button className="primary" type="submit" disabled={!canSubmit || submitting}>
          {submitting ? "Changing…" : "Change Password"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Wire "Change Password" into `TopBar.jsx`'s dropdown**

In `web/src/components/TopBar.jsx`, add the import at the top (after the existing imports, line 5):

```js
import ChangePasswordForm from "./ChangePasswordForm";
```

Add state below the existing `menuOpen` state (line 8):

```jsx
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
```

Insert a "Change Password" button between the `menuItems.map(...)` block and the "Sign Out" button (currently `TopBar.jsx:45-67`):

```jsx
              {menuItems.map(([label, path]) => (
                <button
                  key={path}
                  className="list-row"
                  style={{ padding: "12px 16px", border: "none" }}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(path);
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                className="list-row"
                style={{ padding: "12px 16px", border: "none" }}
                onClick={() => {
                  setMenuOpen(false);
                  setPasswordChanged(false);
                  setShowChangePassword(true);
                }}
              >
                Change Password
              </button>
              <button
                className="list-row"
                style={{ padding: "12px 16px", border: "none", color: "var(--brand-red)" }}
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                Sign Out
              </button>
```

Add the modal render block right after the closing `</div>` of the `showMenu &&` block (immediately before the final closing `</div>` of the component, i.e. after what is currently `TopBar.jsx:71`):

```jsx
      {showChangePassword && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ width: 340, background: "white" }}>
            {passwordChanged ? (
              <>
                <h3 style={{ marginTop: 0 }}>Password Changed</h3>
                <p className="muted">Your password has been updated.</p>
                <button className="primary" onClick={() => setShowChangePassword(false)}>
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0, color: "var(--brand-navy)" }}>Change Password</h3>
                <ChangePasswordForm
                  onSuccess={() => setPasswordChanged(true)}
                  onCancel={() => setShowChangePassword(false)}
                />
              </>
            )}
          </div>
        </div>
      )}
```

The full updated return block's end now looks like:

```jsx
      {showMenu && (
        <div style={{ position: "relative" }}>
          {/* ...existing menu button + dropdown, with the two new/changed buttons above... */}
        </div>
      )}
      {showChangePassword && (
        /* ...block above... */
      )}
    </div>
  );
}
```

- [ ] **Step 6: Start the emulator-backed dev server**

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training > /tmp/emulators2.log 2>&1 &
for i in $(seq 1 30); do curl -s http://127.0.0.1:8080 > /dev/null && break; sleep 1; done
VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort > /tmp/devserver.log 2>&1 &
for i in $(seq 1 30); do curl -s http://127.0.0.1:5178 > /dev/null && break; sleep 1; done
```

Seed an evaluator account to sign in as (auth emulator + Firestore emulator, same technique as Task 1):

```bash
EVAL2UID=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"email":"topbar.evaluator@example.com","password":"OldPass!2026","returnSecureToken":true}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).localId))")

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$EVAL2UID" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"topbar.evaluator@example.com"},"displayName":{"stringValue":"TopBar Evaluator"},"role":{"stringValue":"evaluator"},"isActive":{"booleanValue":true}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/meta/appState" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstAdminCreated":{"booleanValue":true}}}'
```

Note: this account has no `mustChangePassword` field at all — proving the voluntary flow works independently of the forced-gate feature built in Task 3.

- [ ] **Step 7: Drive the flow with Playwright and verify success**

Per this repo's `web:verify` skill: install Playwright as a project devDependency if not already present (`npm install -D @playwright/test && npx playwright install chromium`), then run a script from `web/` using a 390x844 viewport. The script should:

1. `page.goto("http://127.0.0.1:5178/login")`
2. Fill email `topbar.evaluator@example.com`, password `OldPass!2026`, click `button:has-text("Sign In")`.
3. Wait for navigation off `/login` (this evaluator lands on `HomePage` at `/`, not the admin dashboard, per this skill's selector notes).
4. Click the menu button (`button[aria-label="Menu"]`), then `text=Change Password` — scoped inside `.card:has(h3)` per the skill's modal-scoping note once the modal is open.
5. Fill Current Password = `OldPass!2026`, New Password = `NewPass!2027`, Confirm = `NewPass!2027`. Click `button:has-text("Change Password")` (the submit button, scoped to the modal to avoid matching the dropdown item of the same text).
6. Expect `text=Password Changed` to appear. Click `button:has-text("Done")`.
7. Sign out (`text=Sign Out`), then sign in again with the *new* password (`NewPass!2027`) — expect a successful login (proves the change actually persisted in Firebase Auth, not just in the UI).

Expected: step 7's sign-in succeeds and lands on `/` (not an "Incorrect email or password" error).

- [ ] **Step 8: Also verify the wrong-current-password error path**

Repeat steps 1-4 above with a fresh sign-in (new evaluator or reuse the same one before changing its password, if run before Step 7's change), submit with an intentionally wrong Current Password, and confirm `text=Current password is incorrect.` renders and the modal stays open.

- [ ] **Step 9: Stop the dev server and emulators**

```bash
kill %2 %1 2>/dev/null || true
```

- [ ] **Step 10: Commit**

```bash
git add web/src/context/AuthContext.jsx web/src/components/ChangePasswordForm.jsx web/src/components/TopBar.jsx
git commit -m "feat: let signed-in users change their own password from the account menu"
```

---

### Task 3: Forced password change on first login

**Files:**
- Create: `web/src/pages/ForceChangePasswordPage.jsx`
- Modify: `web/src/App.jsx:37-46` (the `RequireAuth` gate) and its imports.
- Modify: `web/src/pages/AdminsPage.jsx:247-254` (`NewUserModal.handleCreate`'s `setDoc` call).
- Modify: `web/src/pages/RecruitsAdminPage.jsx:196-203` (`handleSave`'s `setDoc` call for a new portal login).

**Interfaces:**
- Consumes: Task 2's `ChangePasswordForm` component (same `{ onSuccess, onCancel? }` props, used here with no `onCancel`) and `useAuth()`'s `logout`; Task 1's Firestore rule (same as Task 2, `changeOwnPassword`'s internal Firestore write needs it).
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Create `ForceChangePasswordPage.jsx`**

Create `web/src/pages/ForceChangePasswordPage.jsx`:

```jsx
import badge from "../assets/gfd-badge.png";
import { useAuth } from "../context/AuthContext";
import ChangePasswordForm from "../components/ChangePasswordForm";

/** Rendered by App.jsx's RequireAuth in place of any route whenever adminDoc.mustChangePassword
 * is true — blocks every screen until the account holder sets a new password. There is no
 * Cancel button (ChangePasswordForm hides it when onCancel is omitted); Sign Out is the only
 * escape hatch, so someone who isn't ready isn't trapped. */
export default function ForceChangePasswordPage() {
  const { logout } = useAuth();

  return (
    <div className="screen center-column" style={{ paddingTop: 32 }}>
      <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
      <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>Set a New Password</h2>
      <p className="muted" style={{ maxWidth: 340 }}>
        You need to set a new password before continuing.
      </p>

      <div style={{ width: "100%", maxWidth: 340, marginTop: 16 }}>
        <ChangePasswordForm onSuccess={() => {}} />
        <button className="secondary" style={{ marginTop: 10 }} onClick={logout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
```

`onSuccess={() => {}}`: once `changeOwnPassword` clears `adminDoc.mustChangePassword` in local state (inside `AuthContext`, per Task 2 Step 2), `App.jsx`'s `RequireAuth` re-renders and stops rendering this page automatically on its own — there is nothing left for this page to do after a successful change.

- [ ] **Step 2: Wire the gate into `App.jsx`**

In `web/src/App.jsx`, add the import after the existing `ConnectionErrorPage` import (line 6):

```js
import ForceChangePasswordPage from "./pages/ForceChangePasswordPage";
```

Change `RequireAuth` (lines 38-46):

```jsx
function RequireAuth({ children }) {
  const { loading, adminDoc, anyAdminExists, connectionError } = useAuth();
  if (connectionError) return <ConnectionErrorPage />;
  if (loading) return <FullScreenLoading />;
  if (!adminDoc) {
    return <Navigate to={anyAdminExists ? "/login" : "/setup"} replace />;
  }
  return children;
}
```

to:

```jsx
function RequireAuth({ children }) {
  const { loading, adminDoc, anyAdminExists, connectionError } = useAuth();
  if (connectionError) return <ConnectionErrorPage />;
  if (loading) return <FullScreenLoading />;
  if (!adminDoc) {
    return <Navigate to={anyAdminExists ? "/login" : "/setup"} replace />;
  }
  if (adminDoc.mustChangePassword) {
    return <ForceChangePasswordPage />;
  }
  return children;
}
```

- [ ] **Step 3: Stamp `mustChangePassword: true` on new staff accounts**

In `web/src/pages/AdminsPage.jsx`, change the `setDoc` call inside `NewUserModal.handleCreate` (lines 247-254):

```jsx
      await setDoc(doc(db, "admins", uid), {
        email: trimmedEmail,
        displayName,
        role,
        isActive: true,
        notifyOnFailures: role === "admin" ? notifyOnFailures : false,
        createdAt: new Date(),
      });
```

to:

```jsx
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

- [ ] **Step 4: Stamp `mustChangePassword: true` on new recruit portal logins**

In `web/src/pages/RecruitsAdminPage.jsx`, change the `setDoc` call inside `handleSave` (lines 196-203):

```jsx
        await setDoc(doc(db, "admins", uid), {
          email: trimmedLoginEmail,
          displayName: `${firstName} ${lastName}`,
          role: "recruit",
          recruitId,
          isActive: true,
          createdAt: new Date(),
        });
```

to:

```jsx
        await setDoc(doc(db, "admins", uid), {
          email: trimmedLoginEmail,
          displayName: `${firstName} ${lastName}`,
          role: "recruit",
          recruitId,
          isActive: true,
          createdAt: new Date(),
          mustChangePassword: true,
        });
```

- [ ] **Step 5: Start the emulator-backed dev server**

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training > /tmp/emulators3.log 2>&1 &
for i in $(seq 1 30); do curl -s http://127.0.0.1:8080 > /dev/null && break; sleep 1; done
VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort > /tmp/devserver3.log 2>&1 &
for i in $(seq 1 30); do curl -s http://127.0.0.1:5178 > /dev/null && break; sleep 1; done
```

Seed an admin account to sign in as (same technique as Task 1/2):

```bash
ADMINUID=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"email":"force.admin@example.com","password":"AdminPass!2026","returnSecureToken":true}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).localId))")

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$ADMINUID" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"force.admin@example.com"},"displayName":{"stringValue":"Force Admin"},"role":{"stringValue":"admin"},"isActive":{"booleanValue":true}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/meta/appState" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstAdminCreated":{"booleanValue":true}}}'
```

- [ ] **Step 6: Drive the forced-change flow with Playwright**

Using the same Playwright setup as Task 2 Step 7 (390x844 viewport):

1. `page.goto("http://127.0.0.1:5178/login")`, sign in as `force.admin@example.com` / `AdminPass!2026`. This lands on `AdminDashboardPage` at `/` (admin role) per the `web:verify` skill's selector note.
2. Navigate to `/admins`, click "+ Add User". Fill Full Name `New Evaluator`, Email `new.evaluator@example.com`, Temporary Password `TempPass!2026`, leave role as Evaluator. Click "Create" — scoped to `.card:has(h3)` per the modal-scoping note. Expect "User Created" to appear; click "Done".
3. Sign out. Sign in as `new.evaluator@example.com` / `TempPass!2026`.
4. Expect the page to show "Set a New Password" (`ForceChangePasswordPage`) rather than the normal home screen. Also directly `page.goto("http://127.0.0.1:5178/start-test")` while still signed in as this account and confirm it *still* shows "Set a New Password" instead of the test picker — proving the gate covers every route, not just `/`.
5. Try submitting with a wrong Current Password (anything other than `TempPass!2026`) — expect `text=Current password is incorrect.` and the gate still showing.
6. Submit with Current Password `TempPass!2026`, New Password `FreshPass!2027`, Confirm `FreshPass!2027`. Expect the gate to disappear and the normal Evaluator home screen (`HomePage`) to render, with no further prompt.
7. Sign out, sign back in as `new.evaluator@example.com` with the *new* password `FreshPass!2027` — expect a normal, ungated sign-in (no "Set a New Password" screen) — proving the flag was actually cleared, not just bypassed client-side for the current session.

Expected: all of the above hold; step 7 in particular is the proof that Task 1's Firestore rule and Task 2's `changeOwnPassword` flag-clearing logic are both working together correctly through this entry point too.

- [ ] **Step 7: Stop the dev server and emulators**

```bash
kill %2 %1 2>/dev/null || true
```

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/ForceChangePasswordPage.jsx web/src/App.jsx web/src/pages/AdminsPage.jsx web/src/pages/RecruitsAdminPage.jsx
git commit -m "feat: force a password change on first login for admin-created accounts"
```

---

## Self-Review Notes

- **Spec coverage:** Every element of the design spec (`docs/superpowers/specs/2026-07-13-self-service-password-change-design.md`) maps to a task: the Firestore rule → Task 1; `changeOwnPassword` + voluntary dropdown entry point → Task 2; the forced first-login gate + the two account-creation call sites that set the flag → Task 3. The "explicitly out of scope" items (email, `LoginPage`/admin-initiated resets, `SetupAdminPage`, retroactive migration) are untouched by every task above.
- **Placeholder scan:** None — every step has complete, pasteable code or exact runnable commands with expected output.
- **Type consistency:** `changeOwnPassword(currentPassword, newPassword)` (Task 2 Step 2) is called with that exact signature and name everywhere it's used (Task 2's `ChangePasswordForm`, consumed identically in Task 3's `ForceChangePasswordPage` since both use the same component). `ChangePasswordForm`'s props (`onSuccess`, `onCancel`) are used consistently: Task 2's `TopBar.jsx` modal passes both; Task 3's `ForceChangePasswordPage` passes only `onSuccess`. `mustChangePassword` is the same field name in the Firestore rule (Task 1), `changeOwnPassword` (Task 2), `RequireAuth` (Task 3), and both account-creation call sites (Task 3).
