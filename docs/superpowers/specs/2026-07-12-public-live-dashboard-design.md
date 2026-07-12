# Public Live Dashboard — Design

## Goal

A no-login URL showing the same command board as `ReportingHomePage.jsx`
(full KPIs, flagged recruits, readiness matrix — recruit names and
per-test pass/fail included, confirmed scope), for a wall-mounted or
shared-screen display. No navigation into the rest of the app. Auto-
refreshes every 90 seconds. After 8 hours the page blanks itself and
requires the link to be reopened. The link is revocable — an admin can cut
it off and issue a new one.

## Why this needs new Firestore rules, and the honest limit of what they enforce

Every existing read in this app requires `isStaff()`/`isAdminRole()`/etc.,
which all resolve through `isActiveUser()` — a signed-in Firebase Auth user
with a matching `admins/{uid}` doc. A true no-login page can't satisfy
that, so it needs a different identity: **Firebase Anonymous Auth**,
signed in invisibly on page load (no form, matches "no login" from the
visitor's perspective) — the standard no-backend pattern for this.

Firestore rules evaluate the request, not the URL — a rule can't check
"did this anonymous session arrive via a valid `/live/:token` link."
That check only happens in `LiveDashboardPage.jsx`'s own code (look up the
token doc, render or refuse accordingly). So the realistic security
posture is: **the rule change opens read access to `recruits`/`templates`/
`sessions` to *any* anonymous Firebase session**, not only ones that passed
through a valid link — someone who extracted this project's `firebaseConfig`
(not a secret; it ships in the public JS bundle for every Firebase web app,
same as it already does today for this app's authenticated users) could
query Firestore directly and bypass the token check entirely. This is a
real, accepted tradeoff of "no server, free tier" colliding with "no
login" — the token + revoke flow stops the ordinary case (a shared link
that's no longer needed gets cut off with one click) but isn't a hard
security boundary against a deliberate attacker. Flagging this plainly
since it's a real change to the app's data-exposure profile — worth the
admin knowing before turning it on, not a silent gap.

## Data model

- `publicLiveLinks/{token}`: `{ active: true, createdAt }`. `token` is a
  random id (`crypto.randomUUID()`), the doc id itself — never listed, only
  ever fetched by exact id, so knowing one token reveals nothing about
  others.
- Regenerating: admin's "Regenerate Link" sets the old doc's `active:
  false` (kept for audit rather than deleted) and creates a new doc with a
  fresh token. The rule only honors `active == true`, so the old link stops
  working the instant this write commits.

## Firestore rules changes (`firestore.rules`)

```
function isAnonymousLiveViewer() {
  return isSignedIn() && request.auth.token.firebase.sign_in_provider == 'anonymous';
}

match /publicLiveLinks/{token} {
  allow get: if true;             // token itself is the secret; never listed
  allow write: if isAdminRole();
}
```

Then OR `isAnonymousLiveViewer()` into the existing `allow read` on
`recruits`, `templates`, and `sessions` (read-only additions — no write
rule changes anywhere). `isActiveUser()`-gated rules are untouched, so
nothing changes for logged-in staff/admin/recruit access.

## Screens

**Admin side** — `ReportingHomePage.jsx` gets a small "Live Dashboard Link"
control: shows the current link (or "No active link yet"), a "Copy" button,
and "Generate"/"Regenerate Link" which does the revoke-and-recreate write
above.

**Public side** — new `LiveDashboardPage.jsx`, route `/live/:token` added
as its own top-level `<Route>` in `App.jsx` — **not** wrapped in
`RequireAuth`/`RequireStaff`/`RequireAdminRole`, since none of those apply
to an anonymous visitor.

1. On mount: `signInAnonymously(auth)` if not already signed in (new helper
   in `firebase.js`), then `getDoc(publicLiveLinks/{token})`.
2. Token missing or `active !== true` → render a plain "This link is no
   longer active — ask an administrator for the current live dashboard
   link" screen. No retry-polling; the link must be reloaded, which is the
   point.
3. Valid token → render the command board: reuses
   `loadCommandBoardData()`/`buildCommandBoard()` from `reportsData.js`
   as-is (same data shape `ReportingHomePage` already renders). No
   `TopBar`, no back button, and the flagged-recruit rows / recruit-name
   cells that are normally clickable links into `/reports/recruits/:id`
   render as plain text here instead — per the "no navigation into the
   app" requirement, since that route is auth-gated and the visitor has no
   session that could open it anyway.
4. Auto-refresh: `setInterval(() => loadCommandBoardData().then(...), 90_000)`
   re-renders the board in place every 90 seconds.
5. 8-hour timeout: a `setTimeout` started at mount
   (`8 * 60 * 60 * 1000` ms) flips a `timedOut` state, which clears the
   refresh interval and replaces the board with a plain "This session has
   expired after 8 hours — reload the link to continue viewing" screen.

## Files touched / added

- `web/firestore.rules` (`isAnonymousLiveViewer()`, `publicLiveLinks`
  match, read-rule additions on `recruits`/`templates`/`sessions`)
- `web/src/pages/LiveDashboardPage.jsx` (new)
- `web/src/App.jsx` (new public route, outside all `Require*` wrappers)
- `web/src/pages/reporting/ReportingHomePage.jsx` (Generate/Regenerate Link
  control, admin-only)
- `web/src/firebase.js` (anonymous sign-in helper)
