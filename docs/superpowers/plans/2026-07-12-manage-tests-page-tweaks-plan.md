# Manage Tests Page Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five small, independent fixes to the test-template management flow: hide draft tests from the live-test picker (including for admins), rename "Retire" to "Delete", show template descriptions as subtitles in Manage Tests, fix "Save & Exit" to return to Manage Tests instead of Home, and move "+ New Test Template" to the top of its list.

**Architecture:** No new components, no new data model, no new routes. Each task is a targeted, self-contained edit to one existing page component under `web/src/pages/`.

**Tech Stack:** React 18 + Vite, Firebase v10 (Firestore/Auth JS SDK), React Router v6. No unit test framework is installed in this repo (`web/package.json` has no vitest/jest and no `test` script) — this plan verifies each task with `npm run build` (compile safety) plus a driven UI check through this repo's own `GFD-Training-Practicals/web:verify` emulator+Playwright harness (`web/.claude/skills/verify/SKILL.md`), which is the real, working verification path in this codebase.

## Global Constraints

- No Firestore schema or security-rule changes for any task in this plan (per spec: "No Firestore schema or security-rule changes").
- Soft-delete semantics on templates (`isActive: false`) must not change — only the button label changes (Task 2).
- Every modal in this app renders as `.card:has(h3)` — scope Playwright locators to that when a task's verification touches a modal.
- The Firestore/Auth emulators must be running and the dev server started with `VITE_USE_EMULATOR=1` before any Playwright-driven verification step (see "Emulator harness setup" below, done once and reused by every task).

---

## Emulator harness setup (run once, before Task 1)

This is shared setup all five tasks' verification steps depend on. It is not its own task with a "deliverable" — it just needs to be running before you drive any browser check below.

- [ ] **Step 1: Confirm Java is available (required for the Firestore emulator)**

Run: `java -version`
Expected: prints a Java version (any recent version is fine). If missing, stop and install a JDK before continuing — the emulator harness cannot run without it.

- [ ] **Step 2: Start the Auth + Firestore emulators**

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training &
```

Expected: log output showing `✔  auth: Auth Emulator ... 9099` and `✔  firestore: Firestore Emulator ... 8080`.

- [ ] **Step 3: Start the dev server pointed at the emulators**

```bash
VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort &
```

Expected: Vite prints `Local: http://127.0.0.1:5178/`.

- [ ] **Step 4: Seed one admin account and the app-state doc**

```bash
TESTUID=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify.admin@example.com","password":"VerifyBot!2026","returnSecureToken":true}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])")

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$TESTUID" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"verify.admin@example.com"},"displayName":{"stringValue":"Verify Admin"},"role":{"stringValue":"admin"},"isActive":{"booleanValue":true}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/meta/appState" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstAdminCreated":{"booleanValue":true}}}'
```

Expected: both `curl` calls return the patched document JSON (no error body).

- [ ] **Step 5: Confirm login works**

Use Playwright (global install at `require("/opt/node22/lib/node_modules/playwright")`, Chromium at `/opt/pw-browsers`, viewport 390x844 — phone-first design):

```js
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-*/chrome-linux/chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:5178/login");
  await page.fill('input[type="email"]', "verify.admin@example.com");
  await page.fill('input[type="password"]', "VerifyBot!2026");
  await page.click('button:has-text("Log In")');
  await page.waitForURL("http://127.0.0.1:5178/");
  console.log("login OK");
  await browser.close();
})();
```

Expected: prints `login OK` with no timeout error. Keep this browser/session pattern — every task below reuses it.

---

### Task 1: Hide draft tests from the live-test picker, including for admins (#3)

**Files:**
- Modify: `web/src/pages/HomePage.jsx:15-30` (query effect), `web/src/pages/HomePage.jsx:69-80` (template tile render)

**Interfaces:**
- Consumes: `useAuth()`'s `isAdmin` (unchanged elsewhere in the app — only this file's use of it for the templates query/badge is removed)
- Produces: nothing new — no other task depends on this one

- [ ] **Step 1: Seed one published and one draft template in the emulator**

```bash
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/templates/pub-test-1" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"name":{"stringValue":"Ladder Raise"},"isActive":{"booleanValue":true},"status":{"stringValue":"published"}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/templates/draft-test-1" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"name":{"stringValue":"Unfinished Evolution"},"isActive":{"booleanValue":true},"status":{"stringValue":"draft"}}}'
```

Expected: both return the patched document JSON.

- [ ] **Step 2: Drive the Home screen as the admin and confirm the draft tile is gone (this is the "failing test" — it must fail against the current code)**

```js
// continuing the logged-in `page` from harness Step 5
await page.goto("http://127.0.0.1:5178/");
const publishedTile = page.locator(".test-tile", { hasText: "Ladder Raise" });
const draftTile = page.locator(".test-tile", { hasText: "Unfinished Evolution" });
await publishedTile.waitFor();
const draftCount = await draftTile.count();
console.log("draft tile count:", draftCount);
```

Run this against the unmodified code first.
Expected (current, unfixed behavior): `draft tile count: 1` — the draft tile is visible to the admin with a "Draft" badge. This confirms the bug the task fixes.

- [ ] **Step 3: Edit `HomePage.jsx` to always filter to published templates**

Replace lines 15-30:

```js
  useEffect(() => {
    // Every account — admin, evaluator, or recruit — only ever sees published tests on this
    // picker. Drafts are managed and previewed from Manage Tests (TemplatesAdminPage.jsx)
    // instead, never started as a live test from here.
    const q = query(
      collection(db, "templates"),
      where("isActive", "==", true),
      where("status", "==", "published")
    );
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    });
  }, []);
```

Note the effect's dependency array changes from `[isAdmin]` to `[]` — the query no longer branches on `isAdmin`.

Replace lines 69-80 (the template tile render, dropping the `isDraft` badge):

```js
        {templates.map((template) => (
          <button key={template.id} className="test-tile" style={{ display: "block" }} onClick={() => navigate(`/test/${template.id}`)}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{template.name}</div>
            {template.description && <div className="muted">{template.description}</div>}
          </button>
        ))}
```

- [ ] **Step 4: Rebuild and re-run the same Playwright check**

```bash
npm run build
```
Expected: `vite build` completes with no errors.

Re-run the Step 2 script (Vite HMR will have already picked up the change if the dev server from harness Step 3 is still running; a hard refresh via `page.reload()` before the check is safest):

```js
await page.reload();
const draftCount2 = await page.locator(".test-tile", { hasText: "Unfinished Evolution" }).count();
console.log("draft tile count after fix:", draftCount2);
```
Expected: `draft tile count after fix: 0`. The published tile must still be present — re-check `await publishedTile.count()` is `1`.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/HomePage.jsx
git commit -m "fix: hide draft tests from the live-test picker for all roles"
```

---

### Task 2: Rename "Retire" to "Delete" on Manage Tests (#6)

**Files:**
- Modify: `web/src/pages/TemplatesAdminPage.jsx:55-61`

**Interfaces:**
- Consumes: existing `retire(template)` handler (`TemplatesAdminPage.jsx:21-23`) — kept as-is, including its name; only the button's visible label text changes
- Produces: nothing new

- [ ] **Step 1: Drive Manage Tests and confirm the current label (failing check)**

```js
await page.goto("http://127.0.0.1:5178/templates");
const retireCount = await page.locator('button:has-text("Retire")').count();
console.log("Retire button count:", retireCount);
```
Expected (current behavior): `Retire button count: 1` (or however many templates are seeded) — confirms the label to be changed.

- [ ] **Step 2: Change the button label**

In `TemplatesAdminPage.jsx`, line 60, replace:

```jsx
                  Retire
```

with:

```jsx
                  Delete
```

(The `onClick={() => retire(template)}` on line 58 and the `retire` function itself at lines 21-23 are unchanged — this is a label-only edit, per spec: soft-delete semantics stay exactly as they are.)

- [ ] **Step 3: Rebuild and re-check**

```bash
npm run build
```
Expected: no errors.

```js
await page.reload();
const deleteCount = await page.locator('button:has-text("Delete")').count();
const retireCountAfter = await page.locator('button:has-text("Retire")').count();
console.log("Delete button count:", deleteCount, "Retire button count:", retireCountAfter);
```
Expected: `Delete button count: 1` (or seeded template count), `Retire button count: 0`.

- [ ] **Step 4: Confirm the underlying soft-delete behavior still works**

```js
await page.locator('button:has-text("Delete")').first().click();
```
Then check Firestore directly:
```bash
curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/templates/pub-test-1" \
  -H "Authorization: Bearer owner"
```
Expected: the document's `isActive` field is now `false` (the doc still exists — it's a soft delete, not removed from Firestore).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/TemplatesAdminPage.jsx
git commit -m "fix: rename Retire button to Delete on Manage Tests (soft-delete behavior unchanged)"
```

---

### Task 3: Show template descriptions as subtitles on Manage Tests (#8)

**Files:**
- Modify: `web/src/pages/TemplatesAdminPage.jsx:44-62`

**Interfaces:**
- Consumes: `template.description` (already an existing optional field on the `templates` doc, written by `NewTemplateModal.handleCreate()` at line 120 and editable in `TemplateEditorPage.jsx:83-86`)
- Produces: nothing new

- [ ] **Step 1: Seed a template with a description**

```bash
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/templates/pub-test-2" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"name":{"stringValue":"Hose Drag"},"description":{"stringValue":"150 ft hose drag, timed"},"isActive":{"booleanValue":true},"status":{"stringValue":"published"}}}'
```
Expected: returns the patched document JSON.

- [ ] **Step 2: Drive Manage Tests and confirm the description is not shown yet (failing check)**

```js
await page.goto("http://127.0.0.1:5178/templates");
const subtitleCount = await page.locator('.card', { hasText: "Hose Drag" }).locator('text=150 ft hose drag, timed').count();
console.log("subtitle count:", subtitleCount);
```
Expected (current behavior): `subtitle count: 0` — the description isn't rendered anywhere in the list yet.

- [ ] **Step 3: Add the subtitle line**

In `TemplatesAdminPage.jsx`, inside the `templates.map` block, change lines 47-54 from:

```jsx
                <div style={{ flex: 1 }} onClick={() => navigate(`/templates/${template.id}`)}>
                  <div style={{ fontWeight: 600 }}>
                    {template.name}{" "}
                    <span className={`badge ${status === "published" ? "pass" : "neutral"}`}>
                      {status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
```

to:

```jsx
                <div style={{ flex: 1 }} onClick={() => navigate(`/templates/${template.id}`)}>
                  <div style={{ fontWeight: 600 }}>
                    {template.name}{" "}
                    <span className={`badge ${status === "published" ? "pass" : "neutral"}`}>
                      {status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                  {template.description && <div className="muted">{template.description}</div>}
                </div>
```

- [ ] **Step 4: Rebuild and re-check**

```bash
npm run build
```
Expected: no errors.

```js
await page.reload();
const subtitleCountAfter = await page.locator('.card', { hasText: "Hose Drag" }).locator('text=150 ft hose drag, timed').count();
console.log("subtitle count after fix:", subtitleCountAfter);
```
Expected: `subtitle count after fix: 1`.

Also confirm a template with no description renders unaffected: the "Ladder Raise" card from Task 1 (no `description` field) should show no muted line and no layout break — visually inspect via `page.screenshot()` or just confirm `await page.locator('.card', { hasText: "Ladder Raise" }).locator('.muted').count()` is `0`.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/TemplatesAdminPage.jsx
git commit -m "feat: show template description as a subtitle on Manage Tests list"
```

---

### Task 4: Fix "Save & Exit" to return to Manage Tests, not Home (#10)

**Files:**
- Modify: `web/src/pages/TemplateEditorPage.jsx:134-136`

**Interfaces:**
- Consumes: `useNavigate()` (already imported/used throughout this file)
- Produces: nothing new

- [ ] **Step 1: Drive the template editor and confirm the current (wrong) destination**

```js
await page.goto("http://127.0.0.1:5178/templates/pub-test-2"); // "Hose Drag" template seeded in Task 3
await page.locator('button:has-text("Save & Exit")').click();
console.log("landed on:", page.url());
```
Expected (current behavior): `landed on: http://127.0.0.1:5178/` — the Home screen, confirming the bug.

- [ ] **Step 2: Fix the navigation target**

In `TemplateEditorPage.jsx`, line 134, replace:

```jsx
        <button className="secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => navigate("/")}>
```

with:

```jsx
        <button className="secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => navigate("/templates")}>
```

- [ ] **Step 3: Rebuild and re-check**

```bash
npm run build
```
Expected: no errors.

```js
await page.goto("http://127.0.0.1:5178/templates/pub-test-2");
await page.locator('button:has-text("Save & Exit")').click();
console.log("landed on after fix:", page.url());
await page.waitForSelector('text=Test Templates'); // TopBar title on Manage Tests
```
Expected: `landed on after fix: http://127.0.0.1:5178/templates` and the `waitForSelector` resolves without timeout (confirms Manage Tests actually rendered, not just the URL changing).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TemplateEditorPage.jsx
git commit -m "fix: Save & Exit returns to Manage Tests instead of Home"
```

---

### Task 5: Move "+ New Test Template" to the top of the list (#11)

**Files:**
- Modify: `web/src/pages/TemplatesAdminPage.jsx:33-93`

**Interfaces:**
- Consumes: existing `showNew` state and `setShowNew` setter (unchanged)
- Produces: nothing new

- [ ] **Step 1: Drive Manage Tests and confirm current DOM order (failing check)**

```js
await page.goto("http://127.0.0.1:5178/templates");
const order = await page.evaluate(() => {
  const screen = document.querySelector(".screen");
  const children = Array.from(screen.children);
  return children.map((el) => el.tagName + ":" + (el.textContent || "").slice(0, 30));
});
console.log(order);
```
Expected (current behavior): the `+ New Test Template` button's entry appears **after** all the template `.card` entries in the printed array — confirms it's currently last.

- [ ] **Step 2: Reorder the JSX**

In `TemplatesAdminPage.jsx`, the `return` block currently orders: intro `<p>`, empty-state message, `templates.map(...)`, then the `+ New Test Template` button (lines 33-93). Move the button to immediately after the intro/empty-state block and before `templates.map(...)`:

```jsx
      <div className="screen">
        <p className="muted">
          Drafts are visible to administrators only. Publish a test to make it available to
          evaluators (and visible on recruits' status lists).
        </p>

        <button className="primary" style={{ marginBottom: 16 }} onClick={() => setShowNew(true)}>
          + New Test Template
        </button>

        {templates.length === 0 && (
          <p className="muted">No test templates yet. Build your first one to start evaluating recruits.</p>
        )}
        {templates.map((template) => {
          // ...unchanged map body (status computation, card JSX)...
        })}
      </div>
```

(Only the button's position moves — from after the `templates.map` closing to right after the intro paragraph, with its margin flipped from `marginTop: 16` to `marginBottom: 16` since it now leads instead of trails. The map body itself, and the `showNew && <NewTemplateModal ... />` block below the closing `</div>`, are untouched.)

- [ ] **Step 3: Rebuild and re-check**

```bash
npm run build
```
Expected: no errors.

```js
await page.reload();
const orderAfter = await page.evaluate(() => {
  const screen = document.querySelector(".screen");
  const children = Array.from(screen.children);
  return children.map((el) => el.tagName + ":" + (el.textContent || "").slice(0, 30));
});
console.log(orderAfter);
```
Expected: the `+ New Test Template` entry now appears immediately after the intro paragraph, before any template `.card` entries.

- [ ] **Step 4: Confirm the button still works (opens the New Test Template modal)**

```js
await page.locator('button:has-text("+ New Test Template")').click();
await page.waitForSelector('.card:has(h3):has-text("New Test Template")');
```
Expected: resolves without timeout — the modal still opens correctly from its new position.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/TemplatesAdminPage.jsx
git commit -m "fix: move + New Test Template button to top of Manage Tests list"
```

---

## Self-Review

**Spec coverage:** All five spec items map 1:1 to a task — #3 → Task 1, #6 → Task 2, #8 → Task 3, #10 → Task 4, #11 → Task 5. The spec's "No Firestore schema or security-rule changes" constraint is honored (every task edits only React component files). The spec's confirmed soft-delete requirement for #6 is explicitly re-verified in Task 2 Step 4.

**Placeholder scan:** No TBD/TODO markers; every step shows exact code or an exact command with an expected result.

**Type consistency:** Only existing exports/handlers are referenced (`retire`, `isAdmin`, `template.description`, `useNavigate`) — no new function names introduced across tasks that could drift.
