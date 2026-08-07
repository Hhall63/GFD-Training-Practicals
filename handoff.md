# Handoff — GFD-Training-Practicals

Last session: 2026-08-06 · worktree `.claude/worktrees/evaluator-wizard` · branch `design-revamp-modal-a11y`

## Project snapshot

Fire department recruit testing web app, real and in active use.

- **Stack:** Vite + React 18 + Firebase/Firestore via the client SDK. No backend, no Cloud Functions — deliberate, to stay on Firebase's free Spark plan. No TypeScript, no unit-test framework; verification is manual / scratch-script / live-browser / emulator.
- **Deploy:** Firebase Hosting, project `gfd-recruit-training`, live at https://gfd-recruit-training.web.app
- **Workflow:** features run in parallel across git worktrees (`.claude/worktrees/`, plus an older `.worktrees/` convention). `main` is a clean sequential-merge trunk — one PR at a time. Note this branch name has now carried three unrelated PRs (#22, #23, #24); pushing to an already-merged branch name works fine, it just re-diverges `origin/<branch>` from `main`.
- **Design system:** `web/DESIGN.md` documents the token system that lives in `web/src/styles/theme.css`. The `impeccable` design-hook detector (`detect.mjs`, config in the gitignored `web/.impeccable/config.json`) runs against touched files.
- **Merging is allowed, with one gate per PR.** `gh pr merge` is gated by an auto-mode classifier that requires an explicit, direct review-skip question ("run a review first, or skip straight to merge?") asked and answered in-session **for that specific PR**. A generic earlier "yes, continue" does not satisfy it. Ask the direct question and the merge goes through — this happened twice this session (PR #23 first try; PR #24 blocked until the question was asked again for #24 specifically, then succeeded). The agent can merge and push to `main`; it just can't skip that one confirmation.
- **Deploy gotcha:** `web/.env` is gitignored, so a fresh worktree doesn't have it. Building without it ships an `apiKey: undefined` bundle that passes a curl check and white-screens in a browser. Copy `web/.env` into the worktree before `npm run build`, and verify with a real browser render, not an HTTP 200.
- **Environment quirk:** Playwright's `waitUntil: "networkidle"` times out against the live URL from this sandbox — Firestore's WebChannel streaming never goes idle through the egress proxy. Use `waitUntil: "domcontentloaded"`. Not a bug in the app.
- **Global config, not repo state:** `GITHUB_PERSONAL_ACCESS_TOKEN` lives in `~/.claude/settings.json`'s `env` block so the `github` plugin's MCP server can authenticate. Machine-local; doesn't travel with the repo.

## Current state

Everything is **merged, deployed, and verified live**. No unfinished code work.

**This session: PR #23 (code) + PR #24 (docs).** Started as `/ui-ux-pro-max` with no argument, aimed at this branch — which turned out to be already fully merged and deployed from the prior session (PR #22), so nothing was actually unfinished. Scope was redirected to the 59 pre-existing `impeccable` findings in `theme.css` that PR #22 had deliberately deferred, plus a fresh design audit. Every one of the 59 flagged lines was read manually against `DESIGN.md`.

Shipped in `2d52c38`, merged to `main` at `afcbe53` (PR #23):

- **Real bug, found during the audit and not one of the 59:** `web/src/components/TopBar.jsx`'s Back/Menu buttons rendered raw Unicode glyphs (`←`, `⋯`) at a bespoke 22px `font-size`, bypassing `Icon.jsx` and DESIGN.md's own "no raw glyphs, use Icon.jsx" rule that PR #22 itself established. Added `back`/`more` cases to `web/src/components/Icon.jsx`, switched `TopBar.jsx` over, dropped the now-dead `font-size: 22px` from `.icon-button`.
- **`web/DESIGN.md` gained two real-but-undocumented entries** rather than forcing code to conform: a 14px "Compact" type step (used consistently at 6+ sites — field labels, form alerts, dashboard tile text — sitting between Label 11-13px and Body 16px), and the 8-hue `category-tag` palette (`web/src/lib/categoryColor.js`) that had zero mention in the Colors section.
- **Two more of the 59 confirmed false positives and suppressed** in the gitignored `web/.impeccable/config.json` (user approved; same mechanism as PR #22's two suppressions): `.recruit-tile .avatar`'s 22px is large-initials glyph sizing, not text hierarchy; the two `hover-lift` shadows' literal `rgba(0, 0, 0, 0.18)` exactly matches the shadow DESIGN.md already documents, just not routed through a `var()`.
- **Two lone one-off sizes reviewed and left unchanged** (user's explicit call): `button.secondary` 15px, `.readiness-cell` 10px — deliberate, low-risk, not drift.
- Detector count on `theme.css` went **59 → 52**.

Merge and deploy for #23: user said "push, merge, and deploy to live web app" → asked the required direct review-skip question (user chose skip) → `gh pr merge 23 --merge --delete-branch=false` succeeded → worktree tree confirmed byte-identical to `origin/main` → `web/.env` confirmed present with the right project ID → clean `npm run build` → `firebase deploy --only hosting --project gfd-recruit-training` (hosting-only correct; no `firestore.rules`/`firestore.indexes.json` touched) → verified live, not just HTTP 200: bundle hash `index-CShQtbFy.js` matched the live site exactly, real non-empty `apiKey` baked in, headless Chrome load showed title "GFD Recruit Testing", correct unauthenticated `/login` redirect, zero console errors.

PR #24 was the mid-session handoff doc update (`21c9861`), docs-only, merged to `main` at `d086f3b`. No redeploy — `handoff.md` isn't part of the built app.

**Prior session: PR #22 — design revamp + modal/a11y consolidation** (`cc6da09`, merged at `1a1cfb7`, deployed). Wrote `web/DESIGN.md` from the existing tokens, extracted a shared `GradeButtons.jsx` (fixing a P0 ~1.7:1 contrast bug on ungraded buttons) and a shared `Icon.jsx`, routed all 6 hand-rolled modals through `Modal.jsx`, and bumped remaining sub-44px touch targets. Fully landed; detail below is the only part still worth carrying.

**Two real bugs were found in `Modal.jsx` itself, and only live browser verification caught them** — a clean build missed both. Worth keeping if anyone touches `Modal.jsx` again:

1. Initial focus-steal used `querySelectorAll(FOCUSABLE_SELECTOR)[0].focus()` — DOM order, not visual focusability. `RecruitFormModal`'s first DOM element is a `display:none` file input, and a real browser silently no-ops `.focus()` on it. Fixed by filtering candidates on `el.offsetParent !== null`.
2. Nested modals (e.g. `ConfirmDialog` opened from inside `RecruitFormModal`) are DOM **descendants** of the outer modal's card — they render into its `children` slot, not as siblings. A `cardRef.contains(document.activeElement)` check therefore returns true for *both* at once, and Escape fired both `onClose` handlers. Fixed with an explicit module-level mount-order stack (`modalStack`); only the topmost instance responds to Escape/Tab-trap. **DOM containment does not imply "is this the topmost modal" when modals aren't portaled out.**

**Older sessions (PRs #18–#21), compressed.** All merged and deployed. Still-binding outcomes: recruit portal logins use **QR code + self-set password** (no admin-typed passwords); account **auto-deactivation is enforced in `firestore.rules`**, not app code; `expiresAt` is **friction, not a security boundary**; a note is **required universally** on paths that require one, no per-screen exceptions; the app stays on the `.web.app` domain. Only unrelated pre-existing PR #2 remains open.

## Key decisions & why

- **Preserved the existing design system instead of revamping it.** `theme.css` was already deliberate, not AI slop. The `/design-revamp` value came from fixing real accessibility defects, not restyling.
- **Consolidated rather than patched.** Three copies of the grade buttons and six hand-rolled modals became one component and one shell each — root-cause fix, smaller diff than fixing every site, and future callers inherit it.
- **Kept `Test Complete`'s non-dismissible behavior via a `dismissible` prop.** Routing it through `Modal.jsx` shouldn't silently change how a modal behaves for evaluators mid-test.
- **When code and DESIGN.md disagree, sometimes the doc is wrong.** The 14px Compact step and the `category-tag` palette were real, consistent, undocumented system pieces — documented rather than refactored away.
- **`impeccable` findings on `theme.css`: 4 suppressed as false positives, ~50 left alone.** Suppressions (user approved, written via `hook-admin.mjs ignore-value` into the **gitignored** `web/.impeccable/config.json`, so they don't propagate to a fresh clone): PR #22 suppressed `side-tab` (flags the `.card--pass`/`--fail`/`--progress`/`.flag-panel` left-border accents, which implement DESIGN.md's own Redundant Signal Rule) and `codex-grid-background` (the `.screen--textured` dot grid, already commented as deliberate); this session added `.recruit-tile .avatar` and the `hover-lift` shadows. **The remaining ~52 are almost all one root cause:** DESIGN.md documents type-ramp steps as *ranges* (`"11-13px"`, `"17-20px"`) while the detector matches exact literal values, so `font-size: 13px` reads as "off ramp" despite being inside the documented label range. Detector-vs-doc-format mismatch, not drift. Don't burn a session "fixing" these.
- **Carried forward, still live:** stay on `.web.app`; auto-deactivate enforced in rules; QR + self-set password; `expiresAt` is friction not security; note required universally; confirm-dialog scoping as decided in the #19 session.

## Open items

Neither of these relates to anything that shipped this session; both are untouched and still unverified.

- **Test Bank Version A/B generate buttons, real-hardware smoke test.** Never done with a physically-connected `.LXRBank` drive. Needs a real thumbdrive plus the native folder-picker API — cannot be automated headlessly.
- **EmailJS failure-notification email.** Noted several sessions back, still unverified.

Housekeeping, not code:

- **Local `main` is 12 PR merges behind `origin/main`.** The main checkout (`C:\Users\ffhal\GFD-Training-Practicals`, separate from any worktree) is still at `a0c2a11`; `origin/main` is at `d086f3b`. Verified: `git rev-list --count --first-parent a0c2a11..origin/main` = 12, spanning PR #12 through #24. Flagged in several consecutive handoffs and widening.
- **Worktree cleanup: still 15 worktrees, nothing removed.** Safe candidates: `nav-labeling-polish`, `confirm-dialogs`, `practicals-grading`, `test-bank-lxrbank-import`, and `evaluator-wizard` (this one — its work is merged and deployed). Whether the other ~9 (`audit-p0-p1-remediation`, `class-report-print-and-transcript-label`, `local-emulator-sandbox`, `plans-evd-batch-aggressive`, and the five older `.worktrees/` ones) are stale is still an open, untouched question.

## How to resume

Git state in this worktree, verified at handoff time: branch `design-revamp-modal-a11y`, HEAD `21c9861`, working tree clean, tracking `origin/design-revamp-modal-a11y`. `git diff --stat HEAD origin/main` is empty — byte-identical to `origin/main` at `d086f3b`.

1. **Sync local main — from the main checkout, not from a worktree:**
   ```
   cd C:\Users\ffhal\GFD-Training-Practicals
   git fetch origin
   git merge --ff-only origin/main   # a0c2a11 -> d086f3b, 12 PRs
   ```
2. **Decide on worktree cleanup.** Remove the five merged worktrees above if you want; leave the ~9 pre-existing ones alone unless you're deliberately auditing them.
3. **Then pick up an open item.** The only real remaining threads are the `.LXRBank` hardware smoke test (needs the physical drive in hand) and the EmailJS notification check. Nothing from this session is half-finished.

If you touch modals or grading UI again, use the Firebase emulator + Playwright harness rather than trusting a clean build — see the `Modal.jsx` bugs above for why.

## Active modes

Ponytail at level `full` for the entire session (confirmed via the SessionStart hook). No other persona/mode skills invoked.
