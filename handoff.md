# Handoff — GFD-Training-Practicals

Last session: 2026-08-06 · worktree `.claude/worktrees/evaluator-wizard` · branch `design-revamp-modal-a11y`

> Revision note: this session reused the same worktree/branch name (`design-revamp-modal-a11y`) for a second, smaller PR (#23) after #22 was already merged — `git push` onto an already-merged branch name works fine (it just diverges origin/<branch> from main again), it's the merge/deploy steps that need to happen again. Prior-session detail below (PRs #18–#22) is compressed; only the still-live constraints were kept. **Correction to a claim in the previous handoff:** that handoff's "Hard boundary" section said this harness *cannot* merge PRs or push to `main` at all, describing it as blocked "confirmed again this session." That was too strong. Per [[feedback-production-deploy-authorization]], `gh pr merge` is gated by an auto-mode classifier that requires an explicit, direct review-skip question answered in-session (a vague earlier "yes, continue" doesn't satisfy it) — it is not an unconditional block. This session asked "run a review first, or skip straight to merge?" via AskUserQuestion, got "skip, merge now," and `gh pr merge 23 --merge --delete-branch=false` succeeded immediately. The previous session may have hit the same gate without asking the specific question, then over-generalized the denial into "cannot merge at all."

## Project snapshot

Fire department recruit testing web app, real and in active use.

- **Stack:** Vite + React 18 + Firebase/Firestore via the client SDK. No backend, no Cloud Functions — deliberate, to stay on Firebase's free Spark plan. No TypeScript, no unit-test framework; verification is manual / scratch-script / live-browser / emulator.
- **Deploy:** Firebase Hosting, project `gfd-recruit-training`, live at https://gfd-recruit-training.web.app
- **Workflow:** features run in parallel across git worktrees (`.claude/worktrees/`, plus an older `.worktrees/` convention). `main` is a clean sequential-merge trunk — one PR at a time.
- **Design system:** `web/DESIGN.md` (written this session) documents the token system that already lived in `web/src/theme.css`. The `impeccable` design-hook detector (`detect.mjs`, config in the gitignored `web/.impeccable/config.json`) runs against touched files.
- **Deploy gotcha:** `web/.env` is gitignored, so a fresh worktree doesn't have it. Building without it ships an `apiKey: undefined` bundle that passes a curl check and white-screens in a browser. This has burned this project before. Copy `web/.env` into the worktree before `npm run build`, and verify with a real browser render, not an HTTP 200.
- **Environment quirk (recurring, confirmed again this session):** Playwright's `waitUntil: "networkidle"` times out against the live URL from this sandbox — Firestore's WebChannel streaming never goes idle through the egress proxy. Use `waitUntil: "domcontentloaded"`. Not a bug in the app.
- **Hard boundary:** this harness cannot merge PRs or push to `main`. Confirmed again this session — the auto-mode classifier blocks `gh pr merge` *and* the GitHub MCP `merge_pull_request` tool alike (same forbidden action, different tool). The user merges.
- **Global config, not repo state:** `GITHUB_PERSONAL_ACCESS_TOKEN` was added to `~/.claude/settings.json`'s `env` block this session so the official `github` plugin's MCP server can authenticate. Machine-local; doesn't travel with the repo.

## Current state

Everything is **merged, deployed, and verified live**. No unfinished code work.

**This session: PR #23 — `/ui-ux-pro-max` follow-up audit on the 59 findings PR #22 deferred.** User asked to continue "modal/a11y work" on this branch; nothing was actually unfinished (PR #22 was already merged+deployed), so scope became: re-audit the 59 pre-existing `impeccable` findings in `theme.css` that #22 deliberately left untouched, plus a general design pass. Manually read every flagged line against `DESIGN.md`.

Shipped in commit `2d52c38` (merged to `main` at `afcbe53`):
- **Real fix, found during the audit, not one of the 59:** `TopBar.jsx`'s Back/Menu buttons rendered raw Unicode glyphs (`←`, `⋯`) at a bespoke 22px `font-size` — bypassing `Icon.jsx` and DESIGN.md's own "no raw glyphs, use Icon.jsx" rule that #22 itself established. Added `back`/`more` cases to `Icon.jsx`, switched `TopBar.jsx` over, dropped the dead `font-size: 22px` from `.icon-button`.
- **`DESIGN.md` gained two real-but-undocumented entries** instead of code being forced to conform: a 14px "Compact" type step (used consistently at 6+ sites — field labels, form alerts, dashboard tile text — sitting between Label 11-13px and Body 16px), and the 8-hue `category-tag` color system (`src/lib/categoryColor.js`) that had zero mention in the Colors section.
- **Two more of the 59 confirmed as false positives and suppressed locally** (user approved, same mechanism as #22's two suppressions): `.recruit-tile .avatar`'s 22px is large-initials glyph sizing, not text hierarchy; the two `hover-lift` shadows' literal `rgba(0, 0, 0, 0.18)` is an exact match of the shadow DESIGN.md already documents, just not routed through a `var()`.
- **Two lone one-off sizes reviewed and left unchanged** (user approved): `button.secondary` 15px, `.readiness-cell` 10px — deliberate, low-risk, not drift.
- **The remaining ~50 of the 59 are false positives from the same root cause**: DESIGN.md documents type-ramp steps as *ranges* (`"11-13px"`, `"17-20px"`), but the detector matches exact literal values — so e.g. `font-size: 13px` reads as "off the ramp" even though 13 is inside the documented label range. Not touched; this is a detector-vs-doc-format mismatch, not drift.

Merge and deploy: opened as PR #23 (not draft) → user said "Push, merge, and deploy to live web app" → asked the required direct review-skip question (user chose skip) → `gh pr merge 23 --merge --delete-branch=false` succeeded → this worktree's tree was confirmed byte-identical to `origin/main` (`git diff --stat HEAD origin/main` empty) → `web/.env` confirmed present with the right project ID → `npm run build` clean → `firebase deploy --only hosting --project gfd-recruit-training` (hosting-only correct; no rules/indexes touched) → verified live: bundle hash `index-CShQtbFy.js` matches local build exactly, real (non-empty) `apiKey` baked in, headless load of the live URL shows correct title/unauthenticated `/login` redirect and zero console errors.

**Prior session: PR #22 — design revamp + modal/a11y consolidation.** Started from `/design-revamp` with no arguments; scope set to the whole `web/` app, direction "high-end/premium" filtered through PRODUCT.md's operational constraints (craft not decoration — no decorative motion on timed-test screens, glove-ready 44px targets, sunlight-legible contrast). Diagnosis found the existing `theme.css` token system was genuinely well-crafted, not AI slop, so it was preserved almost entirely; the real findings were accessibility bugs concentrated on `LiveTestRunnerPage.jsx`, the highest-stakes screen in the app (live grading, evaluator taps mid-test under time pressure).

What shipped in commit `cc6da09`:

- **`web/DESIGN.md`** — new. Extracted from the existing `theme.css`, not invented.
- **`web/src/components/GradeButtons.jsx`** — new shared Pass/Fail component replacing three independent copy-pasted copies (`LiveTestRunnerPage.jsx`, `ChecklistView.jsx`, `TileView.jsx`). Fixes a P0: ungraded buttons rendered white-on-`#c7c7cc` at ~1.7:1 contrast. New `.grade-pending` class handles the ungraded state; a second contrast bug in the *graded* state was fixed with one CSS line — `button.primary.pass-muted { color: var(--text); }` — taking white-on-green at ~3.1:1 to dark ink at ~5.5:1. `row`/`grid` size variants enforce the 44px floor.
- **`web/src/components/Icon.jsx`** — new. The deliberate SVG icon set was promoted out of `AdminDashboardPage.jsx`'s local `Icon` function into a shared component and extended (info/timer/note/camera/play/pause/stop), replacing raw OS emoji (ℹ️⏱️📝📷▶⏸⏹) in the live test runner.
- **All 6 hand-rolled modals routed through the existing `Modal.jsx` shell** — they previously bypassed it entirely (no focus trap, no Escape). The five live-test-runner popups (Return to Home?, Distance Required, Note Required, Test Complete, Stop Test?), `TopBar.jsx`'s change-password overlay, and `RecruitsAdminPage.jsx`'s recruit form. A `dismissible` prop was added to `Modal.jsx` for the one case with no cancel concept (Test Complete), preserving its original non-backdrop-dismissible behavior rather than silently changing it.
- **Remaining sub-44px touch targets bumped to 44px** (Checklist/Tile Start/Stop/Retry/View; RecruitsAdminPage's Reset Password/Remove Login/View Deactivated).

**Two real bugs were found in `Modal.jsx` itself, and only live browser verification caught them.** Worth remembering both the bugs and the pattern:

1. Initial focus-steal used `querySelectorAll(FOCUSABLE_SELECTOR)[0].focus()` — DOM order, not visual focusability. `RecruitFormModal`'s first DOM element is a `display:none` file input, and a real browser silently no-ops `.focus()` on it. Combined with bug 2, Escape was disabled entirely for that modal. Fixed by filtering candidates on `el.offsetParent !== null` before picking the first.
2. Nested modals (e.g. `ConfirmDialog`'s "Remove portal login?" opened from inside `RecruitFormModal`) are DOM **descendants** of the outer modal's card — they render into its `children` slot, not as siblings. So a `cardRef.contains(document.activeElement)` check returns true for *both* modals at once, and Escape fired both `onClose` handlers, closing the outer form when only the inner confirm should close. Fixed with an explicit module-level mount-order stack (`modalStack`); only the topmost instance responds to Escape/Tab-trap. **If `Modal.jsx` is ever touched again: DOM containment does not imply "is this the topmost modal" when modals aren't portaled out.**

Verification actually performed (so the "done" claim is trustworthy):

- Clean `npm run build`, no errors.
- `impeccable`'s `detect.mjs` across every touched file — zero findings in all touched `.jsx`.
- Firebase emulator (`firebase emulators:start --only auth,firestore`) + `VITE_USE_EMULATOR=1 npm run dev`, seeded with a verify-admin account and minimal Firestore docs via REST, driven by a real Playwright script. **This is what caught both `Modal.jsx` bugs — a clean build would have missed both.** 7/7 checks green on the final run (focus trap, Escape-closes, nested-modal Escape scoping, etc.), zero console errors.
- Screenshots confirming the contrast fix visually in both the ungraded and graded PASS states.
- Temp scripts (`.tmp-verify.cjs`, `.tmp-shot.cjs`, `.tmp-livecheck.cjs`) and `firebase-debug.log` deleted before committing; never entered git.

Merge and deploy: opened as draft PR #22 → marked ready → **the user merged it via GitHub**. Landed on `main` at `1a1cfb7` (`Merge pull request #22 from Hhall63/design-revamp-modal-a11y`). Deployed from this worktree directly (its tree was byte-identical to `origin/main` post-merge, and `main` is checked out in the primary directory so this worktree couldn't take it anyway): `firebase deploy --only hosting --project gfd-recruit-training`. Hosting only — unlike PR #21, this PR did not touch `firestore.rules`. Verified live by matching the live `index.html`'s bundle hash against the just-built one, confirming a real non-empty `apiKey` in the bundle, and loading the live URL headlessly — correct title, correct unauthenticated redirect to `/login`, zero console errors.

**Prior session (PRs #18–#21), compressed.** One 8-item user request was decomposed into 4 independent sub-projects, each built in its own worktree through the full superpowers workflow. All four merged and deployed. Load-bearing outcomes still constraining the codebase: recruit portal logins use **QR code + self-set password** (no admin-typed passwords); account **auto-deactivation is enforced in `firestore.rules`**, not in app code, so it holds even if the client is bypassed; `expiresAt` is **friction, not a security boundary** — do not treat it as one; a note is **required universally** on the paths that require one, no per-screen exceptions; and the app stays on the `.web.app` domain (no custom domain). Only unrelated pre-existing PR #2 remains open.

## Key decisions & why

- **Preserved the existing design system instead of revamping it.** `theme.css` was already deliberate. The `/design-revamp` value came from fixing real accessibility defects, not from restyling. Redesigning it would have been churn.
- **Consolidated rather than patched.** Three copies of the grade buttons and six hand-rolled modals became one component and one shell each. Root-cause fix, smaller diff than fixing every site, and every future caller inherits the fix.
- **New branch `design-revamp-modal-a11y` instead of reusing `worktree-evaluator-wizard`.** That branch was already fully merged; reusing it for unrelated work would have made the PR unreviewable.
- **Kept `Test Complete`'s non-dismissible behavior via a `dismissible` prop.** Routing it through `Modal.jsx` shouldn't silently change how a modal behaves for evaluators mid-test.
- **Two `impeccable` findings on `theme.css` suppressed as false positives** (user approved): `side-tab` flags the `.card--pass`/`.card--fail`/`.card--progress`/`.flag-panel` left-border accents, which implement DESIGN.md's own documented Redundant Signal Rule; `codex-grid-background` flags the `.screen--textured` dot grid, already commented as deliberate. Both pre-existing and functional. Suppression written via `hook-admin.mjs ignore-value` into `web/.impeccable/config.json`, which is **gitignored** — it's a local machine setting and won't propagate to a fresh clone or another machine. **59 other pre-existing advisory findings remain in `theme.css`** (color/font-size drift predating this session) — deliberately out of scope, not errors, untouched.
- **Carried forward, still live:** stay on `.web.app`; auto-deactivate enforced in rules; QR + self-set password; `expiresAt` is friction not security; note required universally; confirm-dialog scoping as decided in the #19 session.

## Open items

Carried forward and re-verified as still open. Neither relates to anything that shipped this session.

- **Test Bank Version A/B generate buttons, real-hardware smoke test.** Never done with a physically-connected `.LXRBank` drive. Needs a real thumbdrive plus the native folder-picker API — cannot be automated headlessly.
- **EmailJS failure-notification email.** Noted several sessions back, still unverified.

Housekeeping, not code:

- **Local `main` is 10 PR merges behind `origin/main`, and nobody has run the sync yet.** The main checkout (`C:\Users\ffhal\GFD-Training-Practicals`, separate from any worktree) is still at `a0c2a11`; `origin/main` is now at `1a1cfb7`. Note the old handoff said "5 merges" — that count was already understated. Verified this session: `git rev-list --count --first-parent a0c2a11..origin/main` is 10, spanning PR #12 through PR #22. This has been flagged in three consecutive handoffs and keeps widening.
- **Worktree cleanup, still 15 worktrees, nothing removed this session.** Safe cleanup candidates: `nav-labeling-polish`, `confirm-dialogs`, `practicals-grading`, `test-bank-lxrbank-import`, and `evaluator-wizard` (this one). Note the last entry changed meaning since the old handoff — this worktree is now on `design-revamp-modal-a11y` at `cc6da09`, not `worktree-evaluator-wizard`. It's still a valid candidate, just for different (newer, also-merged-and-deployed) work. Whether the other ~9 (`audit-p0-p1-remediation`, `class-report-print-and-transcript-label`, `local-emulator-sandbox`, `plans-evd-batch-aggressive`, and the five older `.worktrees/` ones) are stale is still an open, untouched question.

## How to resume

Git state in this worktree, verified at handoff time: branch `design-revamp-modal-a11y`, HEAD `2d52c38`, working tree clean, tracking `origin/design-revamp-modal-a11y`. `git diff --stat HEAD origin/main` is empty — the tree is byte-identical to `origin/main` at `afcbe53` (merge commit for PR #23).

1. **Sync local main — from the main checkout, not from a worktree:**
   ```
   cd C:\Users\ffhal\GFD-Training-Practicals
   git fetch origin
   git merge --ff-only origin/main   # a0c2a11 -> afcbe53 (now 11 PRs behind before this sync, not 10 — PR #23 added one more)
   ```
2. **Decide on worktree cleanup.** Remove the five merged worktrees above if you want; leave the ~9 pre-existing ones alone unless you're deliberately auditing them.
3. **Then pick up an open item.** The only real remaining threads are the `.LXRBank` hardware smoke test (needs the physical drive in hand) and the EmailJS notification check. Nothing from this session is half-finished.

If you touch modals or grading UI again, use the emulator + Playwright harness rather than trusting a clean build — see the Current state section for why.

## Active modes

Ponytail at level `full` for the entire session (confirmed via the SessionStart hook). No other persona/mode skills invoked — no humanizer, no caveman, none.
