# Class Report Print Layout & Recruit History Button Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the printed Class Report list recruits back-to-back on the same page (no forced page break per recruit), and relabel the "Recruit History" quick-link button on the Reports home page to "Recruit Transcript".

**Architecture:** Both changes are small, independent edits to the existing `web/` React app (Vite + Firebase). Task 1 removes a `@media print` CSS rule in `web/src/styles/print.css` that currently forces a page break before every recruit after the first on `ClassReportPage`. Task 2 changes a single label string in the `QUICK_LINKS` array on `ReportingHomePage.jsx` — the route, page title, and underlying `RecruitHistoryListPage` are untouched, since only the button's text was requested to change.

**Tech Stack:** React 18, Vite, Firebase (Firestore + Auth), Firebase Local Emulator Suite, Playwright (`@playwright/test`, already a devDependency).

## Global Constraints

- This repo has no unit/component test framework — verification is done with ad-hoc Node/Playwright scripts under `web/.verify/*.cjs`, driven against the Firebase emulator per `web/.claude/skills/verify/SKILL.md`. Follow that existing convention exactly (same script shape, same seeding-via-curl style as `web/.verify/seed-group-bug-fixture.sh`) — do not introduce a new test framework.
- Quick-link button labels on `ReportingHomePage.jsx` are Title Case ("Recruit History", "Test Pass Rates", "Cohort Dashboard", "Class Reports", "Export to Excel") — the new label must match that convention: **"Recruit Transcript"**.
- Do not rename the `/reports/recruits` route, the `RecruitHistoryListPage` component, or its `TopBar` title ("Recruit History") — the request is scoped to the button text only.
- Working directory for all steps below is the `web/` folder unless stated otherwise.

---

### Task 1: Remove forced per-recruit page break in the printed Class Report

**Files:**
- Modify: `web/src/styles/print.css:68-89`
- Create: `web/.verify/seed-classreport-print-fixture.sh`
- Create: `web/.verify/verify-classreport-print-pagination.cjs`

**Interfaces:**
- Consumes: `.class-report-recruit` CSS class already applied per-recruit block in `web/src/pages/reporting/ClassReportPage.jsx:91`. No JS/data changes.
- Produces: nothing consumed by later tasks (Task 2 is independent).

- [ ] **Step 1: One-time environment setup (skip if already done)**

```bash
cd web
npm install
npx playwright install chromium
```

- [ ] **Step 2: Write the seed fixture script**

Create `web/.verify/seed-classreport-print-fixture.sh`:

```bash
#!/usr/bin/env bash
# Seeds two active recruits in the same cohort plus a classReportFilters doc that
# includes both of them (with no templateIds, so each recruit renders its
# "No results yet" empty state — content doesn't matter, only that two
# .class-report-recruit blocks render back to back).
# Run this AFTER the emulators are up and the verify.admin login + meta/appState doc
# exist (see web/.claude/skills/verify/SKILL.md).
set -euo pipefail
BASE="http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents"
AUTH=(-H "Authorization: Bearer owner" -H "Content-Type: application/json")

curl -s -X PATCH "$BASE/recruits/verifyPrintRecruitA" "${AUTH[@]}" -d '{"fields":{
  "firstName":{"stringValue":"Alpha"},
  "lastName":{"stringValue":"Anderson"},
  "recruitClassOrCohort":{"stringValue":"Verify Print Cohort"},
  "isActive":{"booleanValue":true}
}}' > /dev/null

curl -s -X PATCH "$BASE/recruits/verifyPrintRecruitB" "${AUTH[@]}" -d '{"fields":{
  "firstName":{"stringValue":"Beta"},
  "lastName":{"stringValue":"Baker"},
  "recruitClassOrCohort":{"stringValue":"Verify Print Cohort"},
  "isActive":{"booleanValue":true}
}}' > /dev/null

curl -s -X PATCH "$BASE/classReportFilters/verifyPrintFilter" "${AUTH[@]}" -d '{"fields":{
  "name":{"stringValue":"Verify Print Fixture"},
  "cohort":{"stringValue":"Verify Print Cohort"},
  "templateIds":{"arrayValue":{"values":[]}},
  "isActive":{"booleanValue":true}
}}' > /dev/null

echo "Fixture seeded: recruits/verifyPrintRecruitA, recruits/verifyPrintRecruitB, classReportFilters/verifyPrintFilter"
```

- [ ] **Step 3: Write the verify script**

Create `web/.verify/verify-classreport-print-pagination.cjs`:

```javascript
// Verifies the Class Report page does NOT force a page break before every recruit
// after the first when printed. Requires seed-classreport-print-fixture.sh to have
// been run first (creates two recruits in "Verify Print Cohort" and the
// classReportFilters/verifyPrintFilter doc).
const { chromium } = require("@playwright/test");

const BASE_URL = "http://127.0.0.1:5178";

async function main() {
  let browser;
  try {
    console.log("Launching browser...");
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    console.log("Navigating to login...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    console.log("Logging in...");
    await page.fill("#login-email", "verify.admin@example.com");
    await page.fill("#login-password", "VerifyBot!2026");
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(BASE_URL + "/", { timeout: 10000 });

    console.log("Navigating directly to the seeded Class Report...");
    await page.goto(`${BASE_URL}/reports/class/verifyPrintFilter`, { waitUntil: "networkidle" });

    console.log("Waiting for both recruit blocks to render...");
    await page.waitForSelector('h4:has-text("Anderson")', { timeout: 5000 });
    await page.waitForSelector('h4:has-text("Baker")', { timeout: 5000 });

    console.log("Emulating print media and reading computed break-before...");
    await page.emulateMedia({ media: "print" });
    const breakValues = await page.$$eval(".class-report-recruit", (els) =>
      els.map((el) => getComputedStyle(el).breakBefore)
    );

    if (breakValues.length !== 2) {
      throw new Error(`Expected 2 .class-report-recruit blocks, found ${breakValues.length}`);
    }
    console.log(`break-before values: [${breakValues.join(", ")}]`);

    if (breakValues[1] === "page") {
      throw new Error(
        `Second recruit block still forces a page break (break-before: page) — recruits are not printing back to back`
      );
    }

    console.log("\nPASS: Recruits print back to back with no forced page break.");
    await browser.close();
  } catch (err) {
    console.error("FAIL:", err.message);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

main();
```

- [ ] **Step 4: Start the emulator + dev server, seed, and run the script to confirm it FAILS**

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training &
sleep 5
VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort &
sleep 3

TESTUID=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify.admin@example.com","password":"VerifyBot!2026","returnSecureToken":true}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).localId))")

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$TESTUID" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"verify.admin@example.com"},"displayName":{"stringValue":"Verify Admin"},"role":{"stringValue":"admin"},"isActive":{"booleanValue":true}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/meta/appState" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstAdminCreated":{"booleanValue":true}}}'

bash web/.verify/seed-classreport-print-fixture.sh

node web/.verify/verify-classreport-print-pagination.cjs
```

Expected: `FAIL: Second recruit block still forces a page break (break-before: page) — recruits are not printing back to back` (the current `print.css` rule at line 86-88 is still in place).

- [ ] **Step 5: Remove the forced page break rule**

In `web/src/styles/print.css`, replace lines 68-89 (the entire `@media print { ... }` block):

```css
@media print {
  .no-print {
    display: none !important;
  }

  /* Adjacent-sibling combinator (not :first-of-type) because the printable page's own
     TranscriptHeader renders a wrapping <div> before the first .class-report-recruit block,
     which would otherwise make that first recruit div the *second* div of its type and
     defeat a `:first-of-type` reset — causing a spurious blank leading page in print. */
  .class-report-recruit + .class-report-recruit {
    break-before: page;
  }

  @page {
    size: letter;
    margin: 0.5in;
  }

  body {
    background: white;
  }
}
```

with:

```css
@media print {
  .no-print {
    display: none !important;
  }

  @page {
    size: letter;
    margin: 0.5in;
  }

  body {
    background: white;
  }
}
```

- [ ] **Step 6: Re-run the verify script to confirm it PASSES**

```bash
node web/.verify/verify-classreport-print-pagination.cjs
```

Expected:
```
break-before values: [auto, auto]

PASS: Recruits print back to back with no forced page break.
```

- [ ] **Step 7: Stop the emulator and dev server**

```bash
kill %1 %2 2>/dev/null || true
```

(Use whichever job numbers/PIDs the background `firebase emulators:start` and `npm run dev` commands from Step 4 actually got — check with `jobs` first if unsure.)

- [ ] **Step 8: Commit**

```bash
git add web/src/styles/print.css web/.verify/seed-classreport-print-fixture.sh web/.verify/verify-classreport-print-pagination.cjs
git commit -m "fix: print Class Report recruits back to back instead of one per page"
```

---

### Task 2: Rename the "Recruit History" quick-link button to "Recruit Transcript"

**Files:**
- Modify: `web/src/pages/reporting/ReportingHomePage.jsx:10`
- Modify: `web/.verify/verify-task13-buttons.cjs:31` (stale selector referencing the old label)
- Create: `web/.verify/verify-reporthome-recruit-transcript-button.cjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the verify script (will fail against the current label)**

Create `web/.verify/verify-reporthome-recruit-transcript-button.cjs`:

```javascript
// Verifies the Reports home page's quick-link button reads "Recruit Transcript"
// (renamed from "Recruit History") and still navigates to the recruit history list.
const { chromium } = require("@playwright/test");

const BASE_URL = "http://127.0.0.1:5178";

async function main() {
  let browser;
  try {
    console.log("Launching browser...");
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    console.log("Navigating to login...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    console.log("Logging in...");
    await page.fill("#login-email", "verify.admin@example.com");
    await page.fill("#login-password", "VerifyBot!2026");
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(BASE_URL + "/", { timeout: 10000 });

    console.log("Navigating to Reports...");
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "networkidle" });

    console.log('Verifying the "Recruit Transcript" quick-link button exists...');
    const button = await page.waitForSelector('button:has-text("Recruit Transcript")', {
      timeout: 5000,
    });
    if (!button) {
      throw new Error('"Recruit Transcript" button not found');
    }

    console.log('Verifying the old "Recruit History" label is gone...');
    const oldLabelCount = await page.locator('.quick-link-title:has-text("Recruit History")').count();
    if (oldLabelCount !== 0) {
      throw new Error('Quick-link button still reads "Recruit History"');
    }

    console.log('Clicking "Recruit Transcript" and checking it still opens the recruit history list...');
    await page.click('button:has-text("Recruit Transcript")');
    await page.waitForSelector('h1:has-text("Recruit History")', { timeout: 5000 });
    const currentUrl = page.url();
    if (!currentUrl.endsWith("/reports/recruits")) {
      throw new Error(`Expected URL to end with "/reports/recruits", got "${currentUrl}"`);
    }

    console.log("\nPASS: Button reads \"Recruit Transcript\" and still opens the recruit history list.");
    await browser.close();
  } catch (err) {
    console.error("FAIL:", err.message);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Run the script to confirm it FAILS (emulator + dev server from Task 1 Step 4 still running, or restart them the same way)**

```bash
node web/.verify/verify-reporthome-recruit-transcript-button.cjs
```

Expected: `FAIL: "Recruit Transcript" button not found` (the label is still "Recruit History").

- [ ] **Step 3: Rename the button label**

In `web/src/pages/reporting/ReportingHomePage.jsx`, line 10, change:

```javascript
  ["Recruit History", "Full session history per recruit", "/reports/recruits"],
```

to:

```javascript
  ["Recruit Transcript", "Full session history per recruit", "/reports/recruits"],
```

- [ ] **Step 4: Update the stale selector in the existing Task 13 verify script**

In `web/.verify/verify-task13-buttons.cjs`, line 31, change:

```javascript
    await page.click('button:has-text("Recruit History")');
```

to:

```javascript
    await page.click('button:has-text("Recruit Transcript")');
```

- [ ] **Step 5: Re-run the new verify script to confirm it PASSES**

```bash
node web/.verify/verify-reporthome-recruit-transcript-button.cjs
```

Expected:
```
PASS: Button reads "Recruit Transcript" and still opens the recruit history list.
```

- [ ] **Step 6: Re-run the existing Task 13 verify script to confirm the update didn't break it**

```bash
node web/.verify/verify-task13-buttons.cjs
```

Expected: `PASS: Both transcript buttons appear and navigate correctly.`

- [ ] **Step 7: Stop the emulator and dev server (if not already stopped)**

```bash
kill %1 %2 2>/dev/null || true
```

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/reporting/ReportingHomePage.jsx web/.verify/verify-task13-buttons.cjs web/.verify/verify-reporthome-recruit-transcript-button.cjs
git commit -m "feat: rename Recruit History quick-link button to Recruit Transcript"
```
