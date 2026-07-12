// Verifies the Task 4 countdown: it must block the Overall Timer (and the test screen)
// until it finishes, and — because of Task 1's remount fix — the second test in a Test
// Group must get its own fresh countdown too, not skip straight to a running timer.
const { chromium } = require("@playwright/test");

const BASE_URL = "http://127.0.0.1:5178";

async function expectCountdownThenRunningTimer(page) {
  await page.waitForSelector("text=Overall Timer starts in", { timeout: 5000 });
  const digitAtStart = await page.textContent(".countdown-digit");
  if (digitAtStart.trim() !== "3") {
    throw new Error(`Expected the countdown to start at 3, got "${digitAtStart}"`);
  }

  const bannerBefore = await page.textContent(".overall-timer-banner span");
  await page.waitForTimeout(800);
  const bannerDuring = await page.textContent(".overall-timer-banner span");
  if (bannerBefore !== bannerDuring) {
    throw new Error("Overall Timer advanced during the countdown — it should be frozen.");
  }

  await page.waitForSelector("text=Overall Timer starts in", { state: "detached", timeout: 5000 });

  const bannerAfter1 = await page.textContent(".overall-timer-banner span");
  await page.waitForTimeout(1000);
  const bannerAfter2 = await page.textContent(".overall-timer-banner span");
  if (bannerAfter1 === bannerAfter2) {
    throw new Error(`Overall Timer did not start after the countdown: stuck at "${bannerAfter1}"`);
  }
}

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

  // Template A.
  await expectCountdownThenRunningTimer(page);
  await page.click('button:has-text("Pass")');
  await page.click('button:has-text("Next")');
  await page.click('button:has-text("Pass")');
  await page.click('button:has-text("Next")');
  await page.click('.overall-timer-banner button:has-text("Stop Test")');
  await page.click('.card:has(h3:has-text("Stop Test?")) button:has-text("Yes, Stop Test")');
  await page.click('.card:has(h3:has-text("Test Complete")) button:has-text("Go to Next Test")');

  // Template B must get its own fresh countdown, not inherit A's already-finished one.
  await expectCountdownThenRunningTimer(page);
  await page.click('button:has-text("Pass")'); // confirms the test screen is interactive now

  console.log("PASS: countdown gated the Overall Timer on both tests in the group.");
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
