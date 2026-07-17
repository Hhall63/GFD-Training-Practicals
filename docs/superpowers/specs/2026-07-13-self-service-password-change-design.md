# Self-Service Password Change — Design

## Purpose

Two related capabilities for the `web/` React + Firebase app:

1. Any signed-in user (Administrator, Evaluator, or Recruit) can change their own password from the account dropdown menu in `TopBar.jsx`.
2. Accounts created by an admin with an admin-assigned temporary password (new staff accounts via `AdminsPage.jsx`, new recruit portal logins via `RecruitsAdminPage.jsx`) are required to set a new password the first time they sign in, before they can use the rest of the app.

## Explicitly out of scope

- **No email is sent by this feature.** The EmailJS template `template_lcadj6p` (with a `{{link}}` body placeholder) that motivated the initial ask is **not used**. This was narrowed down through clarifying questions: the actual password *reset link* content (Firebase's oobCode) can only be generated and emailed by Firebase itself — the client SDK never exposes that code to app code, so it cannot be re-sent through EmailJS without adding a server (Firebase Cloud Functions with Admin SDK), which requires upgrading off the free Spark plan. That tradeoff was rejected. The dropdown instead opens an in-app form directly; no email round-trip.
- The existing "Reset Password" buttons — `LoginPage.jsx`'s "Forgot Password?" and `AdminsPage.jsx`/`RecruitsAdminPage.jsx`'s admin-initiated "Reset Password" for *other* users, all backed by `AuthContext.requestPasswordReset` → Firebase's `sendPasswordResetEmail` — are unchanged by this work. Those remain the "I don't know my password and I'm not signed in (or am resetting on someone else's behalf)" path; this feature is the "I'm signed in and want to set a new one myself" path.
- `SetupAdminPage.jsx` (the one-time first-admin bootstrap) is untouched — that account chooses its own password directly, so there is nothing temporary about it to force a change on.
- No retroactive `mustChangePassword` migration on existing accounts. Only new accounts created after this ships get the flag.

## Architecture

A single new function, `changeOwnPassword(currentPassword, newPassword)`, is added to `AuthContext.jsx` alongside the existing `login`/`logout`/`requestPasswordReset`, since it needs `auth.currentUser`. It:

1. Reauthenticates with `EmailAuthProvider.credential(auth.currentUser.email, currentPassword)` via `reauthenticateWithCredential` — required because Firebase's `updatePassword` throws `auth/requires-recent-login` unless the session is fresh, and this also genuinely verifies the caller knows their current password before changing it.
2. Calls `updatePassword(auth.currentUser, newPassword)`.
3. If the local `adminDoc.mustChangePassword` is `true`, writes `{ mustChangePassword: false }` to `admins/{uid}` and updates the local `adminDoc` React state directly (see "Why local state must be updated manually" below).

One reusable form component (`ChangePasswordForm.jsx`) drives both entry points:

- **Voluntary**: a new "Change Password" item in `TopBar.jsx`'s account dropdown (visible to every role) opens a modal wrapping the form, with a Cancel button.
- **Mandatory**: a new full-screen page, `ForceChangePasswordPage.jsx`, renders the same form with no Cancel button. `App.jsx`'s `RequireAuth` gate renders this page instead of the requested route whenever `adminDoc.mustChangePassword` is true — a single choke point covering every authenticated route, so no per-page special-casing is needed.

### Why local state must be updated manually

`AuthContext.jsx`'s `adminDoc` is populated by a one-time `getDoc` inside the `onAuthStateChanged` callback (`AuthContext.jsx:30-47`) — it is **not** a live `onSnapshot` listener. Writing `mustChangePassword: false` to Firestore alone would not update the in-memory `adminDoc`, so `RequireAuth` would keep rendering `ForceChangePasswordPage` forever after a successful change. `changeOwnPassword` must therefore also call the `adminDoc` state setter directly after the Firestore write succeeds.

## Data model

New optional field on `admins/{uid}` documents:

```
mustChangePassword: boolean   // present + true only on accounts pending a forced first-login change
```

Set to `true` at creation time in exactly two places:

- `AdminsPage.jsx`'s `NewUserModal.handleCreate` (the `setDoc(doc(db, "admins", uid), {...})` call, `AdminsPage.jsx:247-254`) — admin/evaluator accounts.
- `RecruitsAdminPage.jsx`'s `handleSave` (the `setDoc(doc(db, "admins", uid), {...})` call, `RecruitsAdminPage.jsx:196-203`) — recruit portal-login accounts.

Never set anywhere else. Absent or `false` means no forced change is pending (the default for every account that predates this feature, and for accounts created via `SetupAdminPage.jsx`).

## Firestore rules

Today, `firestore.rules`'s `admins/{adminId}` match block only allows `update`/`delete` for `isAdminRole()` (`firestore.rules:76`). An Evaluator or Recruit therefore cannot write to their own `admins` doc at all — a hard blocker for clearing their own `mustChangePassword` flag.

Add a narrow self-service carve-out: a signed-in user may update *their own* doc if and only if `mustChangePassword` is the *only* key changing, and it is being set to `false`. This does not open any other field (role, isActive, email, notifyOnFailures, etc.) to self-editing.

```
allow update: if isAdminRole()
  || (isSignedIn()
      && request.auth.uid == adminId
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['mustChangePassword'])
      && request.resource.data.mustChangePassword == false);
```

`delete` stays admin-only (unchanged).

## Components

### `web/src/components/ChangePasswordForm.jsx` (new)

Props: `onSuccess: () => void`, `onCancel?: () => void` (omit to hide the Cancel button — used by the forced-gate page).

Fields: current password, new password, confirm new password (all `type="password"`, plain inputs matching `SetupAdminPage.jsx`'s form style — no show/hide toggle, since that's `LoginPage.jsx`-specific chrome not used elsewhere in the app's forms).

Client-side validation before calling `changeOwnPassword`:
- New password ≥ 6 characters (matches the existing convention in `NewUserModal`/`SetupAdminPage`: `password.length >= 6`).
- New password must differ from the current password entered.
- Confirm field must match the new password.

Submit calls `changeOwnPassword(currentPassword, newPassword)` from `useAuth()`. On success, calls `onSuccess()`. On failure, maps `err.code` to a message via `FormAlert variant="error"`:
- `auth/wrong-password` or `auth/invalid-credential` → "Current password is incorrect."
- `auth/too-many-requests` → "Too many attempts. Wait a moment and try again."
- `auth/weak-password` → "Choose a password with at least 6 characters."
- anything else → "Something went wrong. Try again."

### `TopBar.jsx` changes

Add `showChangePassword` state. Add a "Change Password" button to the existing dropdown menu (`TopBar.jsx:45-67`), positioned between the admin nav items and "Sign Out", rendered unconditionally (not gated by `isAdmin` — every role reaches this dropdown via `showMenu`, and every role can have a password). Clicking it closes the dropdown and sets `showChangePassword(true)`. When true, render a modal (same fixed-overlay/`.card` pattern as `AdminsPage.jsx`'s deactivate-confirmation modal) containing `<ChangePasswordForm onSuccess={...} onCancel={...} />`; both callbacks close the modal (`onSuccess` additionally shows a brief "Password changed." confirmation before closing, or simply closes — see plan for the exact micro-UX).

### `web/src/pages/ForceChangePasswordPage.jsx` (new)

Full-screen page styled like `SetupAdminPage.jsx` (badge image, heading, muted explanatory paragraph, centered column). Copy: "You need to set a new password before continuing." Renders `<ChangePasswordForm onSuccess={...} />` with no `onCancel` (so no Cancel button renders). Below the form, a "Sign Out" secondary button (calls `logout()` from `useAuth()`) as an escape hatch, so a user who doesn't want to proceed right now isn't trapped.

### `App.jsx` — `RequireAuth`

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

This is the single gate wrapping every authenticated route (`App.jsx:102-127`), so no individual route needs to change.

## Error handling

- `changeOwnPassword` never swallows errors — it throws, and `ChangePasswordForm` is responsible for catching and mapping to a user-facing message (same contract as `LoginPage.jsx`'s `handleForgotPassword`/`handleSubmit`).
- The Firestore write that clears `mustChangePassword` happens *after* `updatePassword` succeeds. If that write fails (e.g. a rules mismatch or transient offline state), the password itself has still changed successfully — `ChangePasswordForm` should still report success to the user (the password did change), but the forced gate would reappear on next load since the flag wasn't cleared. This is an acceptable edge case (the user can simply re-run the form, entering their *new* password as "current," and the flag will clear then) rather than something to build extra retry machinery around.

## Verification

No automated test framework exists in `web/` (no `*.test.jsx`, no vitest/jest configured — confirmed via `package.json`). Verify by running `npm run dev` and driving the app directly (or via the Firebase emulator per this project's `web:verify` skill if the real backend isn't reachable):

1. **Forced first-login flow**: As an admin, create a new Evaluator (or recruit portal login) with a temp password. Sign out, sign in as that new account. Confirm `ForceChangePasswordPage` renders instead of the normal home screen, and that navigating directly to any other route (e.g. typing a URL) still shows the gate. Try submitting with a wrong "current password" — expect the "Current password is incorrect" error and the gate still showing. Submit with the correct temp password and a valid new password — expect the gate to disappear and the normal home screen (role-appropriate) to render. Sign out and back in with the new password — expect the gate does **not** reappear.
2. **Voluntary change**: As any already-existing signed-in user (no pending flag), open the account dropdown and click "Change Password." Confirm Cancel closes the modal with no changes. Reopen, submit a wrong current password — expect the error. Submit correctly — expect success, modal closes, and signing out/back in with the new password works.
3. **Rules check**: Confirm a non-admin (Evaluator/Recruit) can complete step 1 above (proves the new self-service Firestore rule works) and that the existing admin-only management actions in `AdminsPage.jsx` (role toggle, deactivate, notify toggle) still work unchanged for an admin acting on *other* users' docs (proves the rule change didn't loosen anything beyond the single `mustChangePassword` self-write).
