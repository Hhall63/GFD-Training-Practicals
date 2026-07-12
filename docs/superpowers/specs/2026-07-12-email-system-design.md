# Email System: Practice-Recruit Failure Emails + Welcome Emails — Design

## 1. Failure emails during practice-recruit runs (#2)

Traced `finishSession()` in `LiveTestRunnerPage.jsx:252-289`: on any FAIL
result it unconditionally calls `sendFailureEmail()` — there is no
`isPractice` check anywhere in that path (`isPractice` only gates
reporting/history views: `CohortDashboardPage`, `RecruitHistoryListPage`,
`ExportPage`, `reportsData.js`, etc. — all read-side, none of them touch the
email send). So today, running a test against the practice recruit and
failing it **already** triggers the same failure email as a real recruit.

No code change needed for #2 — this is a verify-and-guard item, not a
fix. Action: during implementation, run a test against the practice recruit
through to a FAIL result (via `verify` skill / emulator harness) and confirm
`failureEmailStatus` lands as `"sent"` (or `"not-configured"` if EmailJS
isn't set up in that environment) on the resulting session doc — proof the
behavior holds, since this was raised as a concern. Add a one-line code
comment at the `sendFailureEmail` call site noting practice-recruit sessions
are intentionally not excluded, so a future edit doesn't accidentally add an
`isPractice` skip.

## 2. Welcome email on new user creation (#9)

Two places create a login today, both via
`createUserAccountWithoutSigningIn(email, password)` while the plaintext
temp password is still in component state:

- `AdminsPage.jsx` `NewUserModal.handleCreate()` (Administrator/Evaluator)
- `RecruitsAdminPage.jsx` `RecruitFormModal.handleSave()`, the
  `wantsNewLogin` branch (recruit portal login)

Both are "new user" creation exactly like #9 describes, so both get the
welcome email — a recruit's portal login is as much a new login as a staff
one, and treating them asymmetrically would be a surprising gap.

- New `sendWelcomeEmail({ toEmail, toName, loginEmail, tempPassword })` in
  `web/src/lib/notify.js`, same EmailJS-first / silent-fallback shape as
  `sendFailureEmail` — reuses `EMAILJS_SERVICE_ID` / `EMAILJS_PUBLIC_KEY`,
  but a **new** template id (`VITE_EMAILJS_WELCOME_TEMPLATE_ID` in `.env` /
  `.env.example`) since the content is unrelated to the failure-report
  template (subject: "Your GFD Recruit Testing login"; body: login email +
  temp password + a line recommending they change it, generated via a
  `buildWelcomeBody()` next to `buildFailureBody()`).
- Called right after the `admins` doc write succeeds in both
  `handleCreate()`/`handleSave()`. Best-effort like the failure path: never
  blocks account creation. On `"not-configured"` or `"failed"`, the modal
  shows an inline note ("Welcome email not sent — share the login/password
  shown above manually") so the admin still has the credentials on screen
  to relay by hand — mirrors the failure-email mailto fallback's spirit
  without needing a second EmailJS template lookup for a mailto link.
- Security note: this mails a plaintext temporary password, same trust
  model the app already accepts for failure-report emails and for on-screen
  password display during creation — not a new risk class for this
  project, and the existing "Reset Password" flow lets the recipient
  rotate it immediately after first login.

## Files touched

- `web/src/lib/notify.js` (`sendWelcomeEmail`, `buildWelcomeBody`)
- `web/src/pages/AdminsPage.jsx` (`NewUserModal.handleCreate`)
- `web/src/pages/RecruitsAdminPage.jsx` (`RecruitFormModal.handleSave`)
- `web/.env.example` (document `VITE_EMAILJS_WELCOME_TEMPLATE_ID`)
- `web/src/pages/LiveTestRunnerPage.jsx` (one-line clarifying comment only)
