// Verifies Task 13: Print buttons on RecruitHistoryDetailPage
// Tests that both "Print Summary Transcript" and "Print Complete Transcript" buttons
// appear and navigate to the correct pages.

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
    // selector fix. (See web/.verify/verify-classreport-print-pagination.cjs for the same
    // workaround.)
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 75000 });

    console.log("Logging in...");
    await page.fill("#login-email", "verify.admin@example.com");
    await page.fill("#login-password", "VerifyBot!2026");
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(BASE_URL + "/", { timeout: 10000 });

    console.log("Navigating to Reports...");
    // NOTE: selector fixed from `button:has-text("Menu")` (0 matches — the button's
    // rendered text is the "⋯" glyph; "Menu" is only its aria-label, which :has-text()
    // does not match) to the aria-label attribute selector. This was a pre-existing,
    // unrelated bug in this script (confirmed independently of this task's rename) that
    // blocked it from ever reaching the Reports page in this local emulator environment.
    await page.click('button[aria-label="Menu"]');
    await page.click('text=Reports');
    // Updated alongside the line-31 selector fix: this quick-link's visible label is now
    // "Recruit Transcript" (Task 2 rename), so the "page has loaded" check below must look
    // for the new label rather than the old one.
    await page.waitForSelector('text=Recruit Transcript', { timeout: 5000 });

    console.log("Navigating to Recruit History...");
    await page.click('button:has-text("Recruit Transcript")');
    await page.waitForSelector('.list-row', { timeout: 5000 });

    // Click on the first recruit in the list
    console.log("Clicking on first recruit...");
    await page.click('.list-row:first-of-type');
    await page.waitForSelector('h4:has-text("Sessions")', { timeout: 5000 });

    // Verify the buttons exist
    console.log("Verifying Print Summary Transcript button exists...");
    const summaryButton = await page.waitForSelector(
      'button:has-text("Print Summary Transcript")',
      { timeout: 5000 }
    );
    if (!summaryButton) {
      throw new Error("Print Summary Transcript button not found");
    }

    console.log("Verifying Print Complete Transcript button exists...");
    const completeButton = await page.waitForSelector(
      'button:has-text("Print Complete Transcript")',
      { timeout: 5000 }
    );
    if (!completeButton) {
      throw new Error("Print Complete Transcript button not found");
    }

    // Test Summary Transcript button navigation
    console.log("Clicking Print Summary Transcript button...");
    await page.click('button:has-text("Print Summary Transcript")');
    // NOTE: was `text=Summary Transcript`, which never matches — TranscriptSummaryPage /
    // TranscriptHeader render no such literal text (only "Print Summary Transcript" button
    // labels elsewhere reference that phrase). Pre-existing, unrelated bug; wait on the
    // shared TranscriptHeader marker instead to confirm the page actually rendered.
    await page.waitForSelector('.transcript-header', { timeout: 5000 });
    const currentUrl = page.url();
    if (!currentUrl.includes("/transcript/summary")) {
      throw new Error(`Expected URL to contain "/transcript/summary", got "${currentUrl}"`);
    }
    console.log(`✓ Navigated to Summary Transcript page: ${currentUrl}`);

    // Go back and test Complete Transcript button
    console.log("Going back to recruit detail...");
    await page.goBack({ waitUntil: "networkidle" });
    await page.waitForSelector('h4:has-text("Sessions")', { timeout: 5000 });

    console.log("Clicking Print Complete Transcript button...");
    await page.click('button:has-text("Print Complete Transcript")');
    // Same pre-existing bug as the Summary Transcript check above: no literal "Complete
    // Transcript" text is ever rendered on this page.
    await page.waitForSelector('.transcript-header', { timeout: 5000 });
    const currentUrl2 = page.url();
    if (!currentUrl2.includes("/transcript/complete")) {
      throw new Error(`Expected URL to contain "/transcript/complete", got "${currentUrl2}"`);
    }
    console.log(`✓ Navigated to Complete Transcript page: ${currentUrl2}`);

    console.log("\nPASS: Both transcript buttons appear and navigate correctly.");
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
