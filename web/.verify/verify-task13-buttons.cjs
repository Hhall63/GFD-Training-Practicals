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
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    console.log("Logging in...");
    await page.fill("#login-email", "verify.admin@example.com");
    await page.fill("#login-password", "VerifyBot!2026");
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(BASE_URL + "/", { timeout: 10000 });

    console.log("Navigating to Reports...");
    await page.click('button:has-text("Menu")');
    await page.click('text=Reports');
    await page.waitForSelector('text=Recruit History', { timeout: 5000 });

    console.log("Navigating to Recruit History...");
    await page.click('button:has-text("Recruit History")');
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
    await page.waitForSelector('text=Summary Transcript', { timeout: 5000 });
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
    await page.waitForSelector('text=Complete Transcript', { timeout: 5000 });
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
