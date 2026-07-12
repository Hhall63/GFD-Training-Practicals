# Public Live Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-login, revocable public URL (`/live/:token`) that shows the same command board as the Reports home page (KPIs, flagged recruits, cohort readiness matrix), auto-refreshing every 90 seconds and expiring after 8 hours of being left open.

**Architecture:** Firebase Anonymous Auth (on a throwaway secondary Firebase App instance, so it never disturbs a real admin's session sharing the same browser) plus a `publicLiveLinks/{token}` Firestore doc that gates access. `firestore.rules` grants read-only access to `recruits`/`templates`/`sessions` to any anonymous session — the token check itself only happens in the page's own code, not in the rules (rules can't see the URL). This is a real, accepted widening of the app's data-exposure profile, documented in the design spec.

**Tech Stack:** React 18, react-router-dom v6, Firebase (Auth + Firestore) JS SDK v10, Vite. No test framework exists in this repo (`web/package.json` has no vitest/jest and no `test` script) — verification is `npm run build` for compile correctness plus the project's own emulator+Playwright harness (`web/.claude/skills/verify/SKILL.md`) for behavioral checks against real `firestore.rules`.

## Global Constraints

- No Firebase Storage, no server — Firestore + Hosting only, Spark (free) plan. Don't introduce anything that needs Blaze.
- Match existing code conventions: inline `style={{...}}` for one-off layout, shared classes from `web/src/styles/theme.css` for anything reusable, `.card`/`.screen--wide`/`.muted`/`.badge` etc. — no new CSS framework.
- All Firestore writes/reads go through the `firebase/firestore` modular SDK the way every existing page does (`collection`, `doc`, `getDoc`, `getDocs`, `query`, `where`).
- `firebase.js`'s existing pattern for "create a session without disturbing the primary app's auth state" is a secondary `initializeApp()` instance (see `createUserAccountWithoutSigningIn`) — reuse that exact technique for the anonymous live-viewer session, for the same reason (this app's `AuthProvider` wraps every route on the single primary `auth` singleton — signing in anonymously on it would kick out any admin logged in in another tab of the same browser).
- Emulator wiring is gated on `import.meta.env.VITE_USE_EMULATOR === "1"` everywhere it appears — never active in a production build.

## Deviation from the design spec (flagged up front)

The spec (`docs/superpowers/specs/2026-07-12-public-live-dashboard-design.md`) says `LiveDashboardPage.jsx` "reuses `loadCommandBoardData()`/`buildCommandBoard()` from `reportsData.js` as-is." That's not quite possible once the secondary-app requirement above is applied: `loadCommandBoardData()` currently hardcodes the primary `db` import, but the live dashboard must read through the **secondary** app's Firestore instance (the one the anonymous user is actually signed into) or every read gets rejected by the rules (`request.auth` would be the primary app's admin/null session, not the anonymous one). Task 3 below makes `loadCommandBoardData` accept an optional Firestore instance parameter, defaulting to the existing primary `db` — a backward-compatible one-line signature change; every existing caller (`ReportingHomePage.jsx`) is untouched. This is the one deviation from the spec's file list, and it's required for the "no server session leakage" property the spec itself asks for implicitly (it never says two Firebase Auth sessions are supposed to collide).

The spec's rules snippet also only grants `allow get: if true` on `publicLiveLinks`. The admin-side "Live Dashboard Link" card needs to find the *current* active link by querying (`where("active","==",true)`), which is a Firestore `list` operation, not `get`. Task 1 adds `allow list: if isAdminRole();` alongside the spec's `get`/`write` rules — admin-only, same pattern as every other `list` rule in this file, no change to the public-facing `get` behavior.

---

## File Structure

- **Modify** `web/firestore.rules` — new `isAnonymousLiveViewer()` helper, new `publicLiveLinks` match block, OR the helper into the existing `recruits`/`templates`/`sessions` read rules.
- **Modify** `web/src/firebase.js` — new `signInAnonymouslyOnSecondaryApp()` helper.
- **Modify** `web/src/lib/reportsData.js` — `loadCommandBoardData()` accepts an optional Firestore instance.
- **Create** `web/src/pages/LiveDashboardPage.jsx` — the public page.
- **Modify** `web/src/App.jsx` — new top-level route, outside all `Require*` wrappers.
- **Modify** `web/src/pages/reporting/ReportingHomePage.jsx` — admin "Live Dashboard Link" card (generate/copy/regenerate).

---

### Task 1: Firestore rules — anonymous live-viewer read access + `publicLiveLinks`

**Files:**
- Modify: `web/firestore.rules`

**Interfaces:**
- Produces: `isAnonymousLiveViewer()` rules function (used nowhere in app code — evaluated server-side only); `publicLiveLinks/{token}` collection shape `{ active: boolean, createdAt: timestamp }`.

- [ ] **Step 1: Add the helper function and the `publicLiveLinks` match block**

Open `web/firestore.rules`. Add this function right after `isRecruitRole()` (currently ending at line 38):

```
    function isRecruitRole() {
      return isActiveUser() && myRole() == 'recruit';
    }

    // Anonymous Firebase Auth session used only by the public, no-login Live Dashboard
    // (/live/:token). Rules can't see the URL/token — that check happens in
    // LiveDashboardPage.jsx itself by reading the publicLiveLinks doc below. This function
    // only proves "this request is an anonymous session", which is why read access granted
    // to it below is a deliberate, documented widening (see the design spec) rather than a
    // real per-link access boundary.
    function isAnonymousLiveViewer() {
      return isSignedIn() && request.auth.token.firebase.sign_in_provider == 'anonymous';
    }
```

Then add this new top-level match block, right after the `match /admins/{adminId} { ... }` block (currently ending at line 61) and before `match /recruits/{recruitId}`:

```
    match /publicLiveLinks/{token} {
      // The token itself is the secret — never listed by an anonymous viewer, only fetched
      // by exact id (LiveDashboardPage does a single getDoc, never a query). Admins can list
      // to find "the current active link" for the Reports-home control.
      allow get: if true;
      allow list: if isAdminRole();
      allow write: if isAdminRole();
    }
```

- [ ] **Step 2: Widen the `recruits`, `templates`, and `sessions` read rules**

In the existing `match /recruits/{recruitId}` block, change:

```
      allow get: if isStaff() || (isRecruitRole() && myUserDoc().recruitId == recruitId);
      allow list: if isStaff();
```

to:

```
      allow get: if isStaff() || (isRecruitRole() && myUserDoc().recruitId == recruitId) || isAnonymousLiveViewer();
      allow list: if isStaff() || isAnonymousLiveViewer();
```

In the existing `match /templates/{templateId}` block, change:

```
      allow read: if isAdminRole()
        || (isActiveUser() && (!('status' in resource.data) || resource.data.status == 'published'));
```

to:

```
      allow read: if isAdminRole()
        || (isActiveUser() && (!('status' in resource.data) || resource.data.status == 'published'))
        || isAnonymousLiveViewer();
```

In the existing `match /sessions/{sessionId}` block, change:

```
      allow read: if isStaff() || (isRecruitRole() && resource.data.recruitId == myUserDoc().recruitId);
```

to:

```
      allow read: if isStaff() || (isRecruitRole() && resource.data.recruitId == myUserDoc().recruitId) || isAnonymousLiveViewer();
```

Leave every `allow write`/`allow create`/`allow update`/`allow delete` rule in the file untouched — this task only ever adds to `allow get`/`allow list`/`allow read` conditions.

- [ ] **Step 3: Verify the rules against the Firestore emulator**

From `web/`, start the emulators (per `web/.claude/skills/verify/SKILL.md`):

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training &
```

Wait a few seconds for `All emulators ready!` in the output, then run:

```bash
# Get an anonymous ID token from the Auth emulator (no email/password — this is exactly
# what signInAnonymously() does under the hood)
ANON_TOKEN=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"returnSecureToken":true}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['idToken'])")

# Seed one recruit and one active publicLiveLinks doc as owner (bypasses rules — setup only)
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/recruits/test-recruit-1" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstName":{"stringValue":"Test"},"lastName":{"stringValue":"Recruit"},"isActive":{"booleanValue":true}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/publicLiveLinks/test-token-123" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"active":{"booleanValue":true}}}'

# Positive check: the anonymous token can read the recruit
curl -s -o /dev/null -w "recruit read: %{http_code}\n" \
  "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/recruits/test-recruit-1" \
  -H "Authorization: Bearer $ANON_TOKEN"

# Positive check: the anonymous token can read the link doc
curl -s -o /dev/null -w "link read: %{http_code}\n" \
  "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/publicLiveLinks/test-token-123" \
  -H "Authorization: Bearer $ANON_TOKEN"

# Negative check: the anonymous token CANNOT write to recruits
curl -s -o /dev/null -w "recruit write (should be denied): %{http_code}\n" -X PATCH \
  "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/recruits/test-recruit-1" \
  -H "Authorization: Bearer $ANON_TOKEN" -H "Content-Type: application/json" \
  -d '{"fields":{"firstName":{"stringValue":"Hacked"}}}'

# Negative check: the anonymous token CANNOT write to publicLiveLinks
curl -s -o /dev/null -w "link write (should be denied): %{http_code}\n" -X PATCH \
  "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/publicLiveLinks/test-token-123" \
  -H "Authorization: Bearer $ANON_TOKEN" -H "Content-Type: application/json" \
  -d '{"fields":{"active":{"booleanValue":false}}}'
```

Expected: `recruit read: 200`, `link read: 200`, `recruit write (should be denied): 403`, `link write (should be denied): 403`. If the reads come back 403, re-check the exact rule edits in Step 2 (a common mistake: forgetting the closing `|| isAnonymousLiveViewer()` inside the existing parenthesized condition rather than after it).

Stop the emulator when done: `kill %1` (or `fg` then Ctrl-C).

- [ ] **Step 4: Commit**

```bash
cd web
git add firestore.rules
git commit -m "Add anonymous live-viewer read rules and publicLiveLinks collection"
```

---

### Task 2: Secondary-app anonymous sign-in helper

**Files:**
- Modify: `web/src/firebase.js`

**Interfaces:**
- Consumes: `firebaseConfig` (already defined at the top of `firebase.js`), `import.meta.env.VITE_USE_EMULATOR`.
- Produces: `signInAnonymouslyOnSecondaryApp(): Promise<{ auth: Auth, db: Firestore, cleanup: () => Promise<void> }>` — `db` is what callers must pass to any Firestore read (e.g. `loadCommandBoardData(db)` from Task 3) so those reads run under the anonymous credential.

- [ ] **Step 1: Add the `signInAnonymously` import**

In `web/src/firebase.js`, change the auth import line:

```js
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } from "firebase/auth";
```

to:

```js
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInAnonymously, signOut } from "firebase/auth";
```

- [ ] **Step 2: Add the helper function**

Append this to the end of `web/src/firebase.js` (after `createUserAccountWithoutSigningIn`):

```js
/**
 * The public Live Dashboard (/live/:token, no login) needs its own Firebase Auth session
 * so an unattended display never disturbs a real admin's session sharing the same browser —
 * AuthProvider wraps every route on the single primary `auth` singleton above, and signing in
 * anonymously on it directly would sign that admin out in every other tab of the same
 * browser. Same secondary-app technique as createUserAccountWithoutSigningIn, except this one
 * stays alive for the page's lifetime (the caller decides when to tear it down via the
 * returned cleanup(), typically on unmount) rather than being torn down immediately.
 *
 * Returns the secondary app's own `auth` and `db` — callers must read Firestore through this
 * `db`, not the primary export above, or the reads run under the wrong (or no) credential.
 */
export async function signInAnonymouslyOnSecondaryApp() {
  const secondaryApp = initializeApp(firebaseConfig, `live-dashboard-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb = getFirestore(secondaryApp);
  if (import.meta.env.VITE_USE_EMULATOR === "1") {
    connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(secondaryDb, "127.0.0.1", 8080);
  }
  await signInAnonymously(secondaryAuth);

  async function cleanup() {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }

  return { auth: secondaryAuth, db: secondaryDb, cleanup };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd web
npm run build
```

Expected: build completes with `✓ built in ...`, no errors. (This only checks the file parses/type-flows correctly through Vite/esbuild — the real behavioral check is Task 6's end-to-end run, since this function needs a running Auth emulator to actually succeed.)

- [ ] **Step 3: Commit**

```bash
cd web
git add src/firebase.js
git commit -m "Add secondary-app anonymous sign-in helper for the Live Dashboard"
```

---

### Task 3: `reportsData.js` — accept an optional Firestore instance

**Files:**
- Modify: `web/src/lib/reportsData.js:28-47`

**Interfaces:**
- Consumes: nothing new.
- Produces: `loadCommandBoardData(firestoreDb?: Firestore): Promise<{ recruits, templates, sessions }>` — `firestoreDb` defaults to the existing primary `db` import, so every existing call site (`ReportingHomePage.jsx`, which calls `loadCommandBoardData()` with no arguments) keeps working unchanged.

- [ ] **Step 1: Change the function signature and its three queries**

In `web/src/lib/reportsData.js`, change:

```js
export async function loadCommandBoardData() {
  const [recruitsSnap, templatesSnap, sessionsSnap] = await Promise.all([
    getDocs(query(collection(db, "recruits"), where("isActive", "==", true))),
    getDocs(query(collection(db, "templates"), where("isActive", "==", true))),
    getDocs(query(collection(db, "sessions"), where("status", "==", SESSION_STATUS.COMPLETED))),
  ]);
```

to:

```js
export async function loadCommandBoardData(firestoreDb = db) {
  const [recruitsSnap, templatesSnap, sessionsSnap] = await Promise.all([
    getDocs(query(collection(firestoreDb, "recruits"), where("isActive", "==", true))),
    getDocs(query(collection(firestoreDb, "templates"), where("isActive", "==", true))),
    getDocs(query(collection(firestoreDb, "sessions"), where("status", "==", SESSION_STATUS.COMPLETED))),
  ]);
```

Also update the doc comment directly above the function (currently describing "Loads the raw data...") to add one sentence: `Accepts an optional Firestore instance so callers signed into a different Firebase Auth session (e.g. the anonymous Live Dashboard) can load through their own credential — defaults to this app's primary db.`

- [ ] **Step 2: Verify it compiles and the existing caller still works**

```bash
cd web
npm run build
```

Expected: build completes cleanly. Then confirm `ReportingHomePage.jsx`'s existing call site is untouched:

```bash
grep -n "loadCommandBoardData" web/src/pages/reporting/ReportingHomePage.jsx
```

Expected output: `loadCommandBoardData().then((raw) => {` — no arguments, still valid since the new parameter defaults.

- [ ] **Step 3: Commit**

```bash
cd web
git add src/lib/reportsData.js
git commit -m "Let loadCommandBoardData accept a caller-supplied Firestore instance"
```

---

### Task 4: `LiveDashboardPage.jsx` + route

**Files:**
- Create: `web/src/pages/LiveDashboardPage.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `signInAnonymouslyOnSecondaryApp()` (Task 2), `loadCommandBoardData(db)` / `buildCommandBoard(raw)` (Task 3 / existing `reportsData.js`), `RESULT` from `web/src/lib/constants.js`.
- Produces: route `/live/:token`, no exports consumed elsewhere.

- [ ] **Step 1: Create the page component**

Create `web/src/pages/LiveDashboardPage.jsx`:

```jsx
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { signInAnonymouslyOnSecondaryApp } from "../firebase";
import { loadCommandBoardData, buildCommandBoard } from "../lib/reportsData";
import { RESULT } from "../lib/constants";

// Fixed in production. Only overridable via query string when VITE_USE_EMULATOR is set (see
// below), so a real visitor can never weaken the 8-hour timeout by editing the URL.
const REFRESH_INTERVAL_MS = 90 * 1000;
const TIMEOUT_MS = 8 * 60 * 60 * 1000;

function KpiTile({ label, value, alert }) {
  return (
    <div className="card card--raised kpi-tile">
      <span className="eyebrow">{label}</span>
      <span className="kpi-accent" aria-hidden="true" />
      <span className={`kpi-value${alert ? " kpi-value--alert" : ""}`}>{value}</span>
    </div>
  );
}

export default function LiveDashboardPage() {
  const { token } = useParams();
  const [phase, setPhase] = useState("loading"); // loading | invalid | active | expired
  const [board, setBoard] = useState(null);
  const [noRecruits, setNoRecruits] = useState(false);
  const refreshIntervalRef = useRef(null);
  const timeoutRef = useRef(null);

  const isEmulator = import.meta.env.VITE_USE_EMULATOR === "1";
  const searchParams = new URLSearchParams(window.location.search);
  const refreshMs =
    isEmulator && searchParams.get("refreshMs") ? Number(searchParams.get("refreshMs")) : REFRESH_INTERVAL_MS;
  const timeoutMs =
    isEmulator && searchParams.get("timeoutMs") ? Number(searchParams.get("timeoutMs")) : TIMEOUT_MS;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { db: secondaryDb, cleanup } = await signInAnonymouslyOnSecondaryApp();
      if (cancelled) {
        cleanup();
        return;
      }

      const linkSnap = await getDoc(doc(secondaryDb, "publicLiveLinks", token));
      if (cancelled) return;
      if (!linkSnap.exists() || linkSnap.data().active !== true) {
        setPhase("invalid");
        return;
      }

      async function refresh() {
        const raw = await loadCommandBoardData(secondaryDb);
        if (cancelled) return;
        setNoRecruits(raw.recruits.length === 0);
        setBoard(buildCommandBoard(raw));
      }

      await refresh();
      if (cancelled) return;
      setPhase("active");

      refreshIntervalRef.current = setInterval(refresh, refreshMs);
      timeoutRef.current = setTimeout(() => {
        clearInterval(refreshIntervalRef.current);
        setPhase("expired");
      }, timeoutMs);
    }

    init();

    return () => {
      cancelled = true;
      clearInterval(refreshIntervalRef.current);
      clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (phase === "loading") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        Loading live dashboard…
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        <h2>This link is no longer active</h2>
        <p className="muted">Ask an administrator for the current live dashboard link.</p>
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        <h2>Session expired</h2>
        <p className="muted">
          This live dashboard view expires after 8 hours. Reload the link to continue viewing.
        </p>
      </div>
    );
  }

  const { kpis, flagged, matrix } = board;

  return (
    <div className="app-shell">
      <div className="screen--wide">
        {noRecruits ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No active recruits yet.
            </p>
          </div>
        ) : (
          <>
            <div className="kpi-row">
              <KpiTile label="Active Recruits" value={kpis.activeRecruitCount} />
              <KpiTile
                label="Overall Pass %"
                value={kpis.overallPassRate == null ? "—" : `${Math.round(kpis.overallPassRate * 100)}%`}
              />
              <KpiTile label="Tests This Week" value={kpis.testsThisWeek} />
              <KpiTile label="At-Risk" value={kpis.atRiskCount} alert={kpis.atRiskCount > 0} />
            </div>

            <div className="flag-panel">
              <h2 className="section-heading" style={{ marginBottom: flagged.length ? 10 : 0 }}>
                ⚑ Flagged
              </h2>
              {flagged.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No flagged recruits — everyone&rsquo;s on track.
                </p>
              ) : (
                flagged.map((f) => (
                  <div key={f.recruitId} className="list-row" style={{ cursor: "default" }}>
                    <div className="flagged-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{f.recruitName}</div>
                        <div className="muted">{f.templateName}</div>
                      </div>
                      <div className="flagged-row-badges">
                        {f.criticalFailure && <span className="badge critical">CRITICAL</span>}
                        <span className="badge fail">FAIL</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <h2 className="section-heading">Cohort Readiness</h2>
            <div className="readiness-legend">
              <span>
                <span className="readiness-legend-dot" style={{ background: "var(--success)" }} />
                Pass
              </span>
              <span>
                <span className="readiness-legend-dot" style={{ background: "var(--brand-red)" }} />
                Fail
              </span>
              <span>
                <span className="readiness-legend-dot" style={{ background: "var(--border)" }} />
                Not tested
              </span>
            </div>

            {matrix.templates.length === 0 ? (
              <p className="muted">No active tests configured yet.</p>
            ) : (
              <div className="readiness-scroll">
                <table className="readiness-grid">
                  <thead>
                    <tr>
                      <th className="readiness-corner">Recruit</th>
                      {matrix.templates.map((t) => (
                        <th key={t.id}>{t.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.recruits.map((r) => (
                      <tr key={r.id}>
                        <th className="readiness-row-head" scope="row">
                          {r.firstName} {r.lastName}
                        </th>
                        {matrix.templates.map((t) => {
                          const entry = matrix.latest.get(`${r.id}_${t.id}`);
                          const cls = !entry ? "pending" : entry.result === RESULT.PASS ? "pass" : "fail";
                          const label = !entry ? "—" : entry.result === RESULT.PASS ? "PASS" : "FAIL";
                          return (
                            <td key={t.id}>
                              <span className={`readiness-cell ${cls}`}>{label}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `web/src/App.jsx`, add the import alongside the other page imports:

```js
import LiveDashboardPage from "./pages/LiveDashboardPage";
```

Add the route right after the `/setup` route's closing `/>` (before the `path="/"` route), so it's clearly outside every `Require*` wrapper:

```jsx
      <Route path="/live/:token" element={<LiveDashboardPage />} />
```

- [ ] **Step 3: Verify it compiles**

```bash
cd web
npm run build
```

Expected: build completes with `✓ built in ...`, no errors, no warnings about the new file.

- [ ] **Step 4: Commit**

```bash
cd web
git add src/pages/LiveDashboardPage.jsx src/App.jsx
git commit -m "Add public /live/:token dashboard page"
```

---

### Task 5: Admin-side Live Dashboard Link control

**Files:**
- Modify: `web/src/pages/reporting/ReportingHomePage.jsx`

**Interfaces:**
- Consumes: `db` from `../../firebase` (already imported in this file's sibling pattern — needs adding here), `collection`/`doc`/`getDocs`/`query`/`setDoc`/`updateDoc`/`where` from `firebase/firestore`.
- Produces: nothing consumed by other tasks — this is the leaf admin UI.

- [ ] **Step 1: Add the imports**

In `web/src/pages/reporting/ReportingHomePage.jsx`, change:

```js
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../../components/TopBar";
import { buildCommandBoard, loadCommandBoardData } from "../../lib/reportsData";
import { RESULT } from "../../lib/constants";
```

to:

```js
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";
import { buildCommandBoard, loadCommandBoardData } from "../../lib/reportsData";
import { RESULT } from "../../lib/constants";
```

- [ ] **Step 2: Add the `LiveDashboardLinkCard` component**

Add this new component in `web/src/pages/reporting/ReportingHomePage.jsx`, right after the existing `KpiTile` function and before `export default function ReportingHomePage()`:

```jsx
function LiveDashboardLinkCard() {
  const [activeToken, setActiveToken] = useState(null); // token string, or null if none active
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDocs(query(collection(db, "publicLiveLinks"), where("active", "==", true))).then((snap) => {
      setActiveToken(snap.empty ? null : snap.docs[0].id);
      setLoading(false);
    });
  }, []);

  async function regenerate() {
    setBusy(true);
    setCopied(false);
    try {
      if (activeToken) {
        await updateDoc(doc(db, "publicLiveLinks", activeToken), { active: false });
      }
      const token = crypto.randomUUID();
      await setDoc(doc(db, "publicLiveLinks", token), { active: true, createdAt: new Date() });
      setActiveToken(token);
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/live/${activeToken}`;
    navigator.clipboard.writeText(url).then(() => setCopied(true));
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Live Dashboard Link</h3>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : activeToken ? (
        <>
          <p className="muted" style={{ wordBreak: "break-all" }}>
            {`${window.location.origin}/live/${activeToken}`}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" style={{ width: "auto", padding: "8px 12px" }} onClick={copyLink}>
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              className="secondary"
              style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
              disabled={busy}
              onClick={regenerate}
            >
              {busy ? "Regenerating…" : "Regenerate Link"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            No active link yet. Anyone with this link can view the command board with no login —
            share it only with a trusted display.
          </p>
          <button
            className="primary"
            style={{ width: "auto", padding: "10px 16px" }}
            disabled={busy}
            onClick={regenerate}
          >
            {busy ? "Generating…" : "Generate Link"}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render it on the page**

In the same file's `ReportingHomePage` function, find the returned JSX's opening:

```jsx
      <div className="screen--wide">
        {noRecruits ? (
```

Change it to render the new card first:

```jsx
      <div className="screen--wide">
        <LiveDashboardLinkCard />
        {noRecruits ? (
```

- [ ] **Step 4: Verify it compiles**

```bash
cd web
npm run build
```

Expected: build completes with `✓ built in ...`, no errors.

- [ ] **Step 5: Commit**

```bash
cd web
git add src/pages/reporting/ReportingHomePage.jsx
git commit -m "Add admin Live Dashboard Link generate/copy/regenerate control"
```

---

### Task 6: End-to-end verification (emulator + Playwright)

**Files:** none (verification only — no code changes in this task).

**Interfaces:** none.

- [ ] **Step 1: Start the emulator-backed dev server**

Per `web/.claude/skills/verify/SKILL.md`:

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training &
VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort &
```

Seed an admin account and the app-state doc exactly as the verify skill documents (its `TESTUID`/`meta/appState` curl block), so the app shows Login instead of the first-run Setup screen. Also seed one active recruit and one published template with at least one completed session, so the command board has non-empty data to render — reuse the `curl -X PATCH .../recruits/...` pattern from Task 1's Step 3, plus a `templates/{id}` and `templates/{id}/lines/{lineId}` doc and a `sessions/{id}` doc with `status: "completed"` and `overallResult: "pass"` or `"fail"`, all via `Authorization: Bearer owner`.

- [ ] **Step 2: Drive the admin side with Playwright — generate a link**

Using the global Playwright install (`require("/opt/node22/lib/node_modules/playwright")`, Chromium at `/opt/pw-browsers`, 390x844 viewport per the verify skill), script:

1. Navigate to `http://127.0.0.1:5178/login`, sign in as the seeded admin.
2. Navigate to Reports (`/reports`).
3. Confirm the "Live Dashboard Link" card shows "No active link yet." and a "Generate Link" button (`.card:has-text("Live Dashboard Link")`, matching the verify skill's "every modal/card scoping" convention).
4. Click "Generate Link". Confirm the card now shows a `/live/...` URL and a "Regenerate Link" button.
5. Extract the shown URL text (e.g. via `page.textContent(".card:has-text('Live Dashboard Link') p.muted")`) — this is the token to use in Step 3 below.

Expected: URL text matches `http://127.0.0.1:5178/live/<36-char-uuid>`.

- [ ] **Step 3: Drive the public side in a fresh, unauthenticated browser context**

Open a **new** Playwright browser context (no cookies/storage shared with the admin session — `browser.newContext()`), navigate to the URL captured above with short-duration overrides appended: `?refreshMs=3000&timeoutMs=8000`.

Confirm, in order:
1. The page shows "Loading live dashboard…" briefly, then the command board (KPI tiles, Flagged panel, Cohort Readiness table) — no `TopBar`, no back button, no clickable recruit-name links (the flagged rows and readiness-grid recruit names should not be `<button>`/`<a>` elements — check via `page.locator(".flagged-row", ).locator("xpath=ancestor::button")` returning zero matches).
2. Wait 4 seconds, confirm the KPI tiles are still showing correct values (refresh fired at 3s and didn't break anything — check via re-reading a KPI tile's text before/after).
3. Wait until just past 8 seconds total from page load, confirm the page now shows "Session expired" / "reload the link to continue viewing" text, and that no further network requests to Firestore fire after that point (check via `page.on("request")` logging, or `read_network_requests` if using the Claude-in-Chrome tools instead of raw Playwright).

- [ ] **Step 4: Verify revocation**

Back in the admin's Playwright context (from Step 2), click "Regenerate Link". Then, in the public context from Step 3, reload the **original** (now-revoked) URL. Confirm it shows "This link is no longer active — ask an administrator for the current live dashboard link" instead of the command board.

- [ ] **Step 5: Verify the rules didn't regress logged-in access**

In the admin's Playwright context, navigate to `/reports/recruits`, `/reports/templates`, `/reports/cohorts` and confirm each still loads its existing data (no new permission errors in the console — check via `read_console_messages` with pattern `permission-denied` or `FirebaseError`).

- [ ] **Step 6: Tear down**

```bash
kill %1 %2  # emulator and dev server background jobs
curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/gfd-recruit-training/databases/(default)/documents"
```

No commit for this task — it's verification only. If any check in Steps 2-5 fails, return to the relevant earlier task, fix, and re-run this task from Step 1.
