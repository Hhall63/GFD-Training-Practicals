// Drives the two-template Test Group fixture through the real UI and asserts the Task 1
// fix: the second test in the group starts at its own line 0 with its own fresh Overall
// Timer, instead of inheriting the first test's currentIndex/isOverallRunning state.
//
// Without the fix: Template A ends at currentIndex 2 (its last line). Template B only has
// 2 lines (indices 0-1), so index 2 is out of range there, and isOverallRunning is stuck
// `true` from Template A, so Template B's own Overall Timer banner never starts ticking.
const { chromium } = require("@playwright/test");

const BASE_URL = "http://127.0.0.1:5178";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${BASE_URL}/login`);
  await page.fill("#login-email", "verify.admin@example.com");
  await page.fill("#login-password", "VerifyBot!2026");
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(BASE_URL + "/");

  await page.goto(`${BASE_URL}/test/group/groupAB`);
  await page.click('.recruit-tile:has-text("Casey Rivera")');
  await page.click('button:has-text("Begin Test")');

  // A later task (#7) added a 3-2-1 countdown that blocks the test screen until it
  // finishes — wait it out before grading, or these clicks land on the overlay instead.
  await page.waitForSelector("text=Overall Timer starts in", { state: "detached", timeout: 5000 });

  // Template A: two Graded steps, then the Overall Timer line finalized via Stop Test.
  await page.click('button:has-text("Pass")');
  await page.click('button:has-text("Next")');
  await page.click('button:has-text("Pass")');
  await page.click('button:has-text("Next")');
  await page.click('.overall-timer-banner button:has-text("Stop Test")');
  await page.click('.card:has(h3:has-text("Stop Test?")) button:has-text("Yes, Stop Test")');
  await page.click('.card:has(h3:has-text("Test Complete")) button:has-text("Go to Next Test")');

  // Now on Template B's session — same countdown gate applies to its own Overall Timer.
  await page.waitForSelector("text=Line 1 of 2", { timeout: 5000 });
  await page.waitForSelector("text=Overall Timer starts in", { state: "detached", timeout: 5000 });

  const bannerBefore = await page.textContent(".overall-timer-banner span");
  await page.waitForTimeout(1500);
  const bannerAfter = await page.textContent(".overall-timer-banner span");
  if (bannerBefore === bannerAfter) {
    throw new Error(`Overall Timer banner did not advance on Template B: stuck at "${bannerBefore}"`);
  }

  console.log("PASS: Template B started at Line 1 of 2 with its own running Overall Timer.");
  console.log(`  banner: "${bannerBefore}" -> "${bannerAfter}"`);
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
