// Reproduces (and proves the fix for) the same-commit effect race between the countdown
// arm-effect and the auto-start effect in LiveTestRunnerRun. Before the fix: the real Overall
// Timer interval starts on the same commit the countdown overlay first renders, then gets torn
// down and never restarted once showCountdown flips true -> false, so overallElapsed freezes
// near 0 for the rest of the session. After the fix: the timer stays frozen WHILE the countdown
// overlay is showing, and starts ticking for the first time only once the countdown finishes.
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

  // Countdown overlay should appear immediately (Overall Timer line present, unfinished).
  await page.waitForSelector("text=Overall Timer starts in", { timeout: 5000 });

  const duringBefore = await page.textContent(".overall-timer-banner span");
  await page.waitForTimeout(800); // still well within the 3s countdown
  const duringAfter = await page.textContent(".overall-timer-banner span");

  if (duringBefore !== duringAfter) {
    throw new Error(
      `FROZEN-DURING-COUNTDOWN check failed: banner changed from "${duringBefore}" to "${duringAfter}" while countdown overlay was still showing.`
    );
  }
  console.log(`PASS: banner frozen during countdown ("${duringBefore}" -> "${duringAfter}")`);

  // Wait for the countdown overlay to finish and disappear.
  await page.waitForSelector("text=Overall Timer starts in", { state: "detached", timeout: 6000 });

  const afterFirst = await page.textContent(".overall-timer-banner span");
  await page.waitForTimeout(1000);
  const afterSecond = await page.textContent(".overall-timer-banner span");

  if (afterFirst === afterSecond) {
    throw new Error(
      `TICKING-AFTER-COUNTDOWN check failed: banner stuck at "${afterFirst}" after countdown finished.`
    );
  }
  console.log(`PASS: banner ticking after countdown finished ("${afterFirst}" -> "${afterSecond}")`);

  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
