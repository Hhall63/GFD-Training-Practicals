# Local Emulator Sandbox — Design

A one-command local environment that runs the app against a completely
separate, fake Firebase backend (Auth + Firestore emulators), so new
features can be built and clicked through without any risk to real recruit
data, admin accounts, or test results in the production Firestore project.

## Problem

`web/src/firebase.js` already has a `VITE_USE_EMULATOR=1` escape hatch that
points `auth`/`db` at the Firebase Local Emulator Suite instead of
production, and `firebase.json` already declares emulator ports
(auth `9099`, firestore `8080`). Neither is wired into anything a developer
can actually run:

- No script starts the emulators.
- No seed data exists, so a freshly started emulator has no admin account —
  the app lands on the "create first administrator" screen every time.
- The documented way to set the flag (`VITE_USE_EMULATOR=1 npm run dev`) is
  bash-only syntax and does not work as typed in PowerShell, this project's
  primary shell on this machine.

Separately, `web/.claude/skills/verify/SKILL.md` (gitignored, per-worktree,
not part of the repo's committed source) already proves out an
emulator-backed harness for AI-agent-driven verification, using raw `curl`
calls against the emulator REST endpoints and the real `gfd-recruit-training`
project id. That tooling is agent-facing, one-off, and out of scope here —
this design is a separate, human-facing, repeatable dev workflow. Both can
coexist; this design does not modify that skill.

## Goal

`npm run sandbox` starts a fully isolated local copy of the app: fresh
in-memory emulators, freshly seeded fake data, dev server pointed at the
emulators. Stopping and re-running it always returns to the same known-good
starting state. Nothing about the existing `npm run dev` (real Firebase
project) changes.

## Components

**`web/.env.sandbox`** (new, committed to git). Holds no real secrets — just
a fake `demo-gfd-sandbox`-style project id and placeholder values, which the
Firebase Auth/Firestore emulators accept without question. Vite loads this
automatically when run with `--mode sandbox`, so switching environments
doesn't depend on shell-specific env-var syntax and works identically in
PowerShell and bash. Sets `VITE_USE_EMULATOR=1`.

**`web/scripts/seed-sandbox.mjs`** (new). A plain Node script (not part of
the Vite/browser bundle) that connects the Firebase JS SDK directly to the
running local emulators and creates:
- one fixed, memorable admin login (same email/password every run)
- the corresponding `admins/{uid}` doc and `meta/appState` doc (so the app
  shows the Login screen, not the first-run Setup screen)
- a doc matching the app's existing practice-recruit shape
  (`web/src/lib/practiceRecruit.js`'s `PRACTICE_RECRUIT_ID` /
  `ensurePracticeRecruit()` fields)
- a couple of additional sample recruits and one sample test template, so
  the Home Screen, recruit picker, and live test runner all have real data
  to click into immediately

**`package.json` scripts** (new):
- `emulators` — `firebase emulators:start --only auth,firestore --project demo-gfd-sandbox`. Runs entirely locally; no login, no real Firebase project, no cost.
- `seed:sandbox` — runs the seed script against a running emulator.
- `dev:sandbox` — `vite --mode sandbox`.
- `sandbox` — orchestrates all three: starts the emulators, waits until
  they're ready to accept connections, runs the seed script, then starts the
  sandbox dev server. One command, one terminal.

**`firebase.json`** — unchanged; emulator ports are already configured.

## Workflow

```
npm run sandbox
```
Prints the dev server URL and the fixed sandbox admin login. Opening the URL
shows a working, pre-populated app, ready to sign in immediately.

**Reset:** stop the command (Ctrl+C) and run it again. Emulator data is
in-memory only — nothing persists to disk — so every run starts from the
same clean, seeded state. This is deliberate: fresh and predictable beats
data that slowly drifts from a known-good baseline.

**Production is untouched:** `npm run dev` continues to use the real `.env`
and real Firebase project exactly as it does today. The sandbox is
additive only.

**Available in every worktree:** `.env.sandbox`, the seed script, and the
npm scripts are all committed to the repo, so any git worktree checked out
from this repo (this project already uses several, for parallel feature
branches) gets the sandbox with no per-worktree setup.

## Desktop instructions file

A plain-text file at
`C:\Users\ffhal\OneDrive\Desktop\GFD Sandbox Instructions.txt` (this
machine's Desktop is OneDrive-redirected). Not part of the git repo — a
personal cheat sheet for this machine, separate from the repo's technical
README. Covers: opening a terminal in the project folder, the one command to
run, the URL to open, the fixed sandbox admin login, and how to stop/reset.

## Non-goals (may revisit later, not built now)

- A second real cloud Firebase project / shareable staging URL for testing
  from a phone. Not needed today since sandbox use is computer-browser-only;
  noted here so the option isn't forgotten if that need comes up later.
- Persisting sandbox data between runs. Explicitly rejected in favor of
  always-fresh seeded state.

## Testing

Manual verification, since no unit-test framework is installed in `web/`
(consistent with this repo's other recent plans):
1. `npm run sandbox` from a clean checkout starts emulators, seeds data, and
   serves the app without errors.
2. The printed URL loads the Login screen (not Setup Admin), and the printed
   sandbox admin credentials sign in successfully.
3. Home Screen, recruit picker, and Manage Tests all show the seeded sample
   data.
4. Stopping and re-running `npm run sandbox` returns to the identical seeded
   state (no leftover data from a prior sandbox session).
5. `npm run dev` (unchanged, real `.env`) still connects to the real
   production Firebase project, confirming the sandbox changes are fully
   additive.
6. `web/.env.sandbox` contains no real Firebase project values (spot-check
   before committing).
