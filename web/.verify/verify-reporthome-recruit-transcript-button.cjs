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
    // NOTE: timeout raised from Playwright's 30s default to 75s. This app keeps a live
    // Firestore Listen long-poll channel open (checking meta/appState / the admin doc)
    // from the moment the page loads, even pre-login. Against the real emulator (not a
    // proxied sandbox where that channel resets quickly) the channel doesn't yield a
    // networkidle-qualifying gap until its ~60s long-poll cycle completes, so the default
    // 30s timeout fires before the login form is ever reachable — unrelated to this task's
    // label change. (See web/.verify/verify-classreport-print-pagination.cjs for the same
    // workaround.)
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 75000 });

    console.log("Logging in...");
    await page.fill("#login-email", "verify.admin@example.com");
    await page.fill("#login-password", "VerifyBot!2026");
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(BASE_URL + "/", { timeout: 10000 });

    console.log("Navigating to Reports...");
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "networkidle", timeout: 75000 });

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
