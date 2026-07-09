---
name: verify
description: Build, run, and drive the GFD Recruit Testing web app end-to-end in this repo. Use when verifying a change to web/ actually works at the UI surface (not just builds). Covers the emulator-backed harness that works from sandboxed environments where Firestore's streaming transport is blocked.
---

# Verifying the GFD Recruit Testing web app

## Key environment fact

The production Firestore backend is **unreachable from the browser in sandboxed/proxied
environments**: the Firestore JS SDK's WebChannel `Listen` streaming channel gets
`ERR_CONNECTION_RESET` through egress proxies that don't support streamed responses
(one-shot REST calls to `firestore.googleapis.com` work fine — it's only the SDK's
streaming transport that dies). Symptom: the app hangs on "Loading…" then falls back to
the **Setup Admin** screen even though admins exist. Don't debug the app — use the
emulator harness below.

## Emulator harness (the reliable path)

Requires Java (Firestore emulator) — check `java -version`.

```bash
cd web
# 1. Start emulators (loads the real firestore.rules; auth on 9099, firestore on 8080)
firebase emulators:start --only auth,firestore --project gfd-recruit-training &

# 2. Start the dev server pointed at the emulators (wiring lives in src/firebase.js,
#    gated on this env var; prod builds never set it)
VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort &
```

Seed a login (auth emulator accepts any API key; Firestore emulator accepts
`Authorization: Bearer owner` to bypass rules for seeding). **Note: `UID` is a readonly
bash variable — name it something else.**

```bash
TESTUID=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify.admin@example.com","password":"VerifyBot!2026","returnSecureToken":true}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])")

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$TESTUID" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"verify.admin@example.com"},"displayName":{"stringValue":"Verify Admin"},"role":{"stringValue":"admin"},"isActive":{"booleanValue":true}}}'

# Without this doc the app shows the first-run Setup screen instead of Login:
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/meta/appState" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstAdminCreated":{"booleanValue":true}}}'
```

Reset between runs: `curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/gfd-recruit-training/databases/(default)/documents"`
(wipes Firestore only — reseed the two docs above; auth users survive).

## Driving with Playwright

Global install exists: `require("/opt/node22/lib/node_modules/playwright")`, Chromium at
`/opt/pw-browsers`. Use a 390x844 viewport (the app is designed phone-first).

Selector gotchas that have burned a run before:
- **Every modal is `.card:has(h3)`** — scope all modal fills/clicks to that locator.
  Unscoped `page.fill("textarea", …)` hits the template Description field *behind* the
  modal; unscoped `input[type=number]` hits the Passing Score field.
- `text=Foo` is case-insensitive substring: `text=PASS` matches "Pass: ≤ 2s", `text=Points`
  matches "total points". Use `.badge:has-text("PASS")` for result badges and
  `label:text-is("Points")` for exact labels.
- The live-runner in-card Stop button is `.screen button:has-text("Stop")` (the sticky
  banner Stop is outside `.screen`).
- Attachment notes save on **blur** — fill the Note textarea then `page.keyboard.press("Tab")`
  before checking Next/Finish enablement.

## Flows worth driving

Login → menu → Manage Tests → build template (instruction + graded w/ points + timer w/
threshold + points; check the "= N of M total points" tally reacts to the passing-%
field) → Manage Recruits → add recruit → Home → run test end-to-end → Results points
line → Reports → Export CSV (capture the download event; check the points columns).
The distinctive scoring case: pass a 10-pt step, fail a 5-pt timer, passing % 60 →
expect 10/15 = 67% → overall PASS despite the failed step.
