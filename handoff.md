# Handoff — GFD-Training-Practicals

Last session: 2026-08-05/06 · worktree `.claude/worktrees/evaluator-wizard` · branch `worktree-evaluator-wizard`

## Project snapshot

Fire department recruit testing web app, real and in active use.

- **Stack:** Vite + React 18 + Firebase/Firestore via the client SDK. No backend, no Cloud Functions — deliberate, to stay on Firebase's free Spark plan. No TypeScript, no unit-test framework; verification is manual / scratch-script / live-browser.
- **Deploy:** Firebase Hosting, project `gfd-recruit-training`, live at https://gfd-recruit-training.web.app
- **Workflow:** features run in parallel across git worktrees (`.claude/worktrees/`, plus an older `.worktrees/` convention). `main` is a clean sequential-merge trunk — one PR at a time.
- **Deploy gotcha:** `web/.env` is gitignored, so a fresh worktree doesn't have it. Building without it ships an `apiKey: undefined` bundle that passes a curl check and white-screens in a browser. This has burned this project before. Copy `web/.env` into the worktree before `npm run build`, and verify with a real browser render, not an HTTP 200.

## Current state

Everything from this session is **merged, deployed, and verified live**. No unfinished code work.

One user request with 8 numbered items was decomposed (brainstorming skill) into 4 independent sub-projects, each built in its own worktree through the full superpowers workflow (brainstorming → writing-plans → subagent-driven-development → finishing-a-development-branch). All 4 PRs are MERGED into `origin/main`; only unrelated pre-existing PR #2 remains open.

### PR #18 — Nav/labeling polish
Spec: `docs/superpowers/specs/2026-08-05-nav-labeling-polish-design.md`

Renamed across nav dropdown and page TopBar titles: "Manage Tests"→"Manage Practicals", "Manage Exams"→"Test Bank", "Enter Exam Scores"→"Written Test Gradebook". Filled the two blank dashboard icon slots in `AdminDashboardPage.jsx` (`Icon`/`ICON_BY_PATH`): archive-box for Test Bank, open-book for Written Test Gradebook. Added a back-to-dashboard button on `HomePage.jsx` ("Select a Test"), shown only when reached via the admin `/start-test` path, reusing `TopBar`'s existing `onBack`. Final review caught a Critical naming collision — the pre-existing per-exam builder at `/exams/:examId/test-bank` also said "Test Bank"; retitled "Build from Test Bank".

### PR #19 — Confirmation dialogs
Spec: `docs/superpowers/specs/2026-08-05-confirm-dialogs-design.md`

New `web/src/components/ConfirmDialog.jsx` (built on the existing `Modal` shell), wired into all 6 genuinely destructive actions: Templates Delete; Exams Deactivate; Test Groups Deactivate; Recruits Deactivate + Remove Login; Admins Deactivate. Each names the item and states recoverability honestly — 5 say "can't be undone in the app"; Recruits says "can reactivate later" because `DeactivatedRecruitsPage.jsx` supports it. Deliberately untouched: the Reactivate button on `DeactivatedRecruitsPage.jsx`, `TestBankBuilder.jsx`'s in-progress working-set Remove, `ObstacleCourseRunner.jsx`'s existing unrelated confirm.

Final review found and fixed two real bugs, both at the one site (`RecruitsAdminPage.jsx` Remove-Login) whose confirm state read through a live Firestore listener prop instead of local item state: (a) Critical — unguarded `existingLogin.email` could throw during render if the listener updated before the confirm callback cleared state, and the app has no error boundary anywhere; (b) Important — the nested dialog's backdrop click bubbled up and also closed the parent edit-recruit form, discarding unsaved edits. Fixed with a guard clause and `stopPropagation()`.

### PR #20 — Practicals grading logic
Spec: `docs/superpowers/specs/2026-08-05-practicals-grading-design.md`

Two changes in `LiveTestRunnerPage.jsx` / `RecruitConfirmPage.jsx`.

1. **Note required on failure, universally.** The brainstorm initially misread this as "restrict the rule to the obstacle course"; the user corrected mid-conversation — *if a practical is graded a failure there must be a note, period.* The real gap was the "⏹ Stop Test" early-stop path: `confirmStopTest()` skipped the check that `advance()`/`submitAll()` already had. All three finish paths now enforce it.
2. **Checklist is the default view** for every practical except one containing an Obstacle Course line, which stays pinned to Standard (unchanged). Two one-line default changes: the picker default in `RecruitConfirmPage.jsx`, the fallback default in `LiveTestRunnerPage.jsx`.

### PR #21 — Evaluator wizard (largest, most security-sensitive)
Spec: `docs/superpowers/specs/2026-08-06-evaluator-wizard-design.md`

New "+ Add Evaluator" flow, separate from "Add User" — which is now admin-only, its role picker removed, since evaluators go exclusively through the wizard. Admin enters email + display name + an optional "Auto-deactivate at 6:00 PM" toggle (that day, or next day if created after 6pm — `computeAutoDeactivateAt()` in the new `web/src/lib/evaluatorInvites.js`).

No temp password is ever shown to anyone. Instead a per-evaluator QR code (new `qrcode` npm dep) links to a new public `/claim/:token` route (`ClaimInvitePage.jsx`) where the evaluator types only their own new password. `claimEvaluatorInvite()` (new, in `web/src/firebase.js`) signs in with a system-generated temp password looked up from the new `evaluatorInvites/{token}` Firestore collection, on a throwaway secondary Firebase App instance — an existing pattern in that file, now used a third time — so it can never disrupt an admin's session in the same browser.

Auto-deactivate is enforced entirely in `firestore.rules`: one clause added to the single existing `isActiveUser()` gate, comparing `autoDeactivateAt` against Firestore's own server clock (`request.time`). No Cloud Functions, no scheduled jobs, still Spark-plan. A live Playwright E2E on a backdated account produced a real `FirebaseError: [code=permission-denied]` from the SDK — not an inferred empty screen.

A whole-branch security review (opus) traced the `uid`/`used`/`autoDeactivateAt` round-trip across the 3 files that must agree (rules, invite creation, claim) and walked the adversarial cases. No auth bypass or credential leak. 3 Important findings, all fixed in commit `a42aa36`:

1. The lazy auto-deactivate sweep in `AdminsPage.jsx` didn't clear `autoDeactivateAt` when deactivating — fixed with `deleteField()`, so a manually-reactivated account can't silently stay locked out with no visible cause.
2. A failure between `updatePassword` succeeding and the claim finishing showed a misleading "Something went wrong" while the new password actually worked — now distinguished via an `invite/partial-claim` error code plus an honest "done" state in `ClaimInvitePage.jsx`.
3. The spec overstated `expiresAt` (7-day expiry) as an enforced security boundary. Corrected — see Key decisions.

### Cross-PR conflict (resolved)
Found after all 4 PRs were open. #18/#19/#20 merged clean via `gh pr merge`. #21 conflicted with already-merged #19 — both independently modified `AdminsPage.jsx` (confirm-dialog wiring vs. the evaluator-wizard button/sweep/admin-only-modal changes). Resolved by fetching and merging `origin/main` into `worktree-evaluator-wizard` locally, reconciling two small regions (a state-declaration line, a render-block ordering) so both features coexist. Clean build verified before push and merge.

### Deploy
`npm run build` + `firebase deploy --only hosting,firestore --project gfd-recruit-training` (firestore included because #21 changed `firestore.rules`). Verified by: fetching the live bundle and confirming it's the freshly-built one, grepping it for a real non-empty `apiKey` and for new-feature strings, and loading the live URL in headless Playwright — correct page title, 0 console errors, correct unauthenticated redirect to `/login`.

## Key decisions & why

- **Stay on `*.web.app`; no custom domain, no GitHub Pages migration.** `gfd-recruit-training.web.app` is already a Google-owned domain and reads as legitimate. A custom domain buys equivalent legitimacy for real churn. (This was item 2 of the original 8 — answered, not built.)
- **Auto-deactivate lives in `firestore.rules`, not a scheduled job.** `request.time` vs. a stored `autoDeactivateAt` is enforcement from Firestore's own clock with zero infrastructure — keeps the project on the free Spark plan, which is a hard project constraint.
- **QR + self-set password instead of showing a temp password.** The admin never sees or relays a credential; the evaluator's password is only ever typed by the evaluator.
- **`expiresAt` is UI friction, NOT a security boundary.** Firebase Auth sign-in and password change sit entirely outside what Firestore rules can govern, so a leaked or unclaimed invite's temp password stays a live, usable credential for as long as the account exists — it does not safely expire on its own. The rules clause exists anyway as friction and is documented in the spec as not a real bound. **The only real revocation is the existing Deactivate button.**
- **Note-required-on-failure applies to every practical.** Enforced at all three finish paths rather than per-test — user-corrected requirement, see PR #20.
- **Confirm dialogs only on genuinely destructive actions.** Reactivate, in-progress working-set edits, and an already-confirmed flow were left alone; more dialogs would be noise.

## Open items

Both carried forward from earlier sessions, re-verified as still open. Neither relates to anything that shipped this session.

- **Test Bank Version A/B generate buttons, real-hardware smoke test.** Never done with a physically-connected `.LXRBank` drive. Needs a real thumbdrive plus the native folder-picker API — cannot be automated headlessly.
- **EmailJS failure-notification email.** Noted in earlier sessions, still unverified.

Housekeeping, not code:

- **Local `main` is 5 merges behind `origin/main`.** Local main checkout (`C:\Users\ffhal\GFD-Training-Practicals`, a separate directory from any worktree) is at `a0c2a11`; `origin/main` is at `9f1488c`. Already flagged in an earlier handoff and has only widened.
- **Worktree cleanup.** `git worktree list` shows 15. Five are clean cleanup candidates: `nav-labeling-polish`, `confirm-dialogs`, `practicals-grading`, `evaluator-wizard` (this one) — all merged and deployed — plus `test-bank-lxrbank-import` (PR #17, merged in an earlier session). Whether the other ~9 (audit-p0-p1-remediation, class-report-print-and-transcript-label, local-emulator-sandbox, plans-evd-batch-aggressive, and the older `.worktrees/` ones) are stale is still an open question, untouched.

## How to resume

Git state in this worktree: HEAD `a7df8d4` (merge of `origin/main` into `worktree-evaluator-wizard`), tree byte-identical to `origin/main` at `9f1488c` (`git diff --stat HEAD origin/main` is empty), working tree clean. Two Playwright scratch artifacts (`live-deploy-check.png`, `.playwright-mcp/`) were created here during deploy verification and removed; never committed.

1. **Sync local main — do this from the main checkout, not from a worktree** (per the earlier handoff's own note on this):
   ```
   cd C:\Users\ffhal\GFD-Training-Practicals
   git fetch origin
   git merge --ff-only origin/main   # a0c2a11 -> 9f1488c
   ```
2. **Decide on worktree cleanup.** Remove the five merged worktrees listed above if you want; leave the ~9 pre-existing ones alone unless you're deliberately auditing them.
3. **Then pick up an open item.** The only real remaining threads are the `.LXRBank` hardware smoke test (needs the physical drive in hand) and the EmailJS notification check. Nothing from this session is half-finished.

## Active modes

Ponytail at level `full` for the entire session (confirmed via the SessionStart hook). No other persona/mode skills invoked.
