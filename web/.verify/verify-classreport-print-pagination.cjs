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
    // NOTE: timeout raised from Playwright's 30s default to 75s. This app keeps a live
    // Firestore Listen long-poll channel open (checking meta/appState / the admin doc)
    // from the moment the page loads, even pre-login. Against the real emulator (not a
    // proxied sandbox where that channel resets quickly) the channel doesn't yield a
    // networkidle-qualifying gap until its ~60s long-poll cycle completes, so the default
    // 30s timeout fires before the login form is ever reachable — unrelated to this task's
    // CSS change.
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 75000 });

    console.log("Logging in...");
    await page.fill("#login-email", "verify.admin@example.com");
    await page.fill("#login-password", "VerifyBot!2026");
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(BASE_URL + "/", { timeout: 10000 });

    console.log("Navigating directly to the seeded Class Report...");
    // Same long-poll-cycle reason as above.
    await page.goto(`${BASE_URL}/reports/class/verifyPrintFilter`, { waitUntil: "networkidle", timeout: 75000 });

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
