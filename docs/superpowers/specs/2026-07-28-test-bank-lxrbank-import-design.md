# Test Bank — .LXRBank Import & Exam Building — Design

An admin-level feature that imports GFD's real written-exam question banks
(exported from LXR Test as `.LXRBank` files) and lets an admin assemble a
printable exam paper and answer key from them, while keeping all actual
question content off Firestore and off the cloud entirely.

## Problem

GFD's written-exam question content already exists in LXR Test's native
format. Today, "Manage Exams" (`ExamsAdminPage.jsx`) only creates an empty
exam shell (name + category); there's no way to build an exam's actual
content from GFD's existing question bank, and no in-app record of what
questions any given exam paper covered.

The question banks contain real, currently-valid certification exam
content. If that content were imported into Firestore the way ordinary app
data is, it would be exposed to anyone with read access to the database —
unacceptable for material that determines pass/fail on a certification
exam. So this feature has to solve two problems at once: parse a
proprietary desktop-software file format, and do it without ever letting
the sensitive content touch the cloud.

## Goal

An admin plugs in a physically-secured thumbdrive holding one or more
`.LXRBank` files. The app authenticates the drive, lets the admin browse
imported questions by category, assemble a question set for a specific
exam (random draw by category, manual pick, or a mix — freely adjustable),
and generate a printable exam paper and a separate answer key as PDFs.
Nothing from inside a bank — question text, answers, reference notes —
is ever written to Firestore or any other part of the app's cloud
infrastructure. Only an opaque reference (which bank, which question IDs,
how many points each) is stored, so an exam can "remember" its own
question set without exposing it.

**This is a prototype build, developed and verified against the local
emulator sandbox** (`npm run sandbox`, see
`docs/superpowers/specs/2026-07-28-local-emulator-sandbox-design.md`), not
against the live production Firebase project. Every piece of it — the new
`testBank` field on exam docs, the new admin screen, the new "Build from
Test Bank" action — is purely additive: nothing about the existing Manage
Exams, grading, or gradebook flow changes for exams that don't use it. The
live app's current status and behavior are unaffected until this feature
is deliberately verified and deployed.

## Security & Drive Access Model

This is the foundation the rest of the feature sits on.

**Drive picking.** The app uses the browser's File System Access API
(`showDirectoryPicker`) to request access to a folder on the thumbdrive.
This is a Chrome/Edge-only API (no Firefox/Safari support) — acceptable
here since this is an internal admin tool used on a GFD admin desktop,
consistent with the rest of this app's Windows/PowerShell environment.
The granted folder handle is persisted in IndexedDB so the admin isn't
re-prompted on every visit, re-verifying permission each session per the
File System Access API's own model.

**Authentication.** On selecting a folder, the app looks for a marker file
(e.g. `.gfd-testbank-auth`) containing a fixed token, and compares it to a
value baked into the app at build time (an env var, same pattern as
`VITE_USE_EMULATOR`). No match (missing file, wrong token, wrong drive) —
access refused outright, nothing in the folder is read. This is a simple
shared-secret check, not cryptographic — someone who fully decompiled the
app's public JS bundle could in principle forge the marker. That's an
accepted tradeoff for an internal tool: the goal is to stop the wrong or
random thumbdrive being accepted, not to defend against a sophisticated
attacker with access to the deployed app's source.

**Nothing sensitive leaves the drive.** Once authenticated, `.LXRBank`
files in that folder are parsed entirely in-browser, in memory, for that
session. Question text, answers, and reference notes are never sent to
Firestore. In-app edits (see below) are written back to the drive, never
to the cloud. The only thing Firestore ever holds is a safe reference:

```
templates/{examId}.testBank = {
  bankFileName: string,
  questionIds: number[],
  pointsById: { [quesId]: number },
  importedAt: Timestamp,
  lastBuiltAt: Timestamp,
}
```

This is meaningless without the actual drive, so it's safe to store. It
lets an exam remember which questions it used across sessions without
needing to re-pick every time — but regenerating the actual PDF still
requires the authorized drive, since only it has the real text.

`pointsById` is informational only — it's what prints next to each
question on the exam paper (carried over from the bank's own
`QB_points`). It does not feed any automated scoring: per the Non-goals
below, grading stays the existing single holistic score entered by an
evaluator, completely unrelated to this per-question point value.

## Import, Parsing & Browsing

**File format.** `.LXRBank` files are Microsoft Access (Jet) databases —
confirmed against a real sample: `Questions`, `Text`, `KeyWords`, and
`KWTitles` tables joined by `QB_quesId`. `mdb-reader` (a pure-JS, browser-
compatible npm package) reads them client-side with no upload and no
backend.

**What's extracted per question**: category (`QB_obj`, e.g. "Sample
Category A"), sequence, points (`QB_points`), stem text (`Text` box 1),
answer text (box 4, prefixed `"Answer: "` in the source), reference notes
(box 5 — outline page, committee approval, source citations), and
keyword/reference codes (`KeyWords`).

**Supported question type**: fill-in-the-blank (`QB_qtype === "OPN"`,
`QB_subtype === "F"`) only — this was 100% of a real sample bank used to
validate the parser during design. Multiple-choice/matching questions store their
choice content in a separate binary (non-text) format that hasn't been
reverse-engineered; if a bank contains them, those questions are shown as
"unsupported" in the browse list rather than guessed at or silently
dropped.

**Browsing.** A "Test Bank" screen, reached from an exam's card in "Manage
Exams," lists every `.LXRBank` file found in the authenticated folder.
Selecting one shows its questions grouped by category, with search/filter.

**Editing.** The original `.LXRBank` file is never written to (no
available library writes the Jet/Access format). In-app edits are saved
as a sidecar JSON file next to the source — `<bankfile>.overrides.json` —
keyed by `QB_quesId`, holding only the fields the admin changed. Loading a
bank merges the parsed original with any overrides file found alongside
it. Editing requires the drive to be plugged in with write access.

## Building an Exam & Generating the PDF

**Entry point.** Each written exam in "Manage Exams" gets a new "Build
from Test Bank" action, opening the Test Bank builder scoped to that exam.

**Assembling the question set** — all three approaches are available
together, not as separate modes:
- *Random draw*: choose one or more categories and a count per category
  (e.g. "5 from Category A, 3 from Category B"); the app randomly selects
  and populates a working list.
- *Manual*: browse/search the full bank and add or remove individual
  questions directly.
- *Adjust*: after a random draw, swap any individual question for another
  in the same category, or hand-build the list from nothing — the working
  list is always freely editable regardless of how items got onto it.

**Finalizing** saves the safe reference (bank filename, question IDs,
points) to the exam's Firestore doc, per the Security section above.

**PDF generation** produces two documents client-side via `jsPDF` (new
dependency; no backend needed):
- **Exam paper** — numbered questions with stem text and blank space to
  write the answer, in assembled order.
- **Answer key** — same order, each question paired with its correct
  answer text.

Both download directly to the admin's machine. Neither is uploaded to
Firebase Storage or stored anywhere else in the app — regenerating later
(reprint, lost paper) requires the authorized drive again, since the
saved reference holds only IDs and the actual text is re-read live from
the bank each time.

## Error Handling

- Wrong/unauthorized drive: clear "not authorized" message, no partial
  access to the folder's contents.
- Drive unplugged or browser permission revoked: prompt to reconnect
  before any bank action (browse, edit, build, regenerate) proceeds.
- Corrupt or unparseable bank file: error scoped to that one file; other
  banks in the same folder remain usable.
- Unsupported question type encountered while parsing: flagged/skipped in
  the browse list, never silently dropped from the count.
- An exam's saved `testBank.bankFileName` isn't found on the (re-)
  connected drive (renamed/deleted/wrong drive): mismatch warning;
  regeneration blocked until resolved.

## Non-goals (V1)

- Multiple-choice, matching, or essay question types — fill-in-the-blank
  only, since that's the entirety of the confirmed sample bank.
- Recruits taking exams question-by-question inside the app. Grading
  stays exactly as it is today: one holistic score entered by an
  evaluator (`recordExamScore` in `web/src/lib/exams.js`, unchanged).
- Cryptographically signed drive authentication — a simple shared-secret
  marker file only.
- Random-draw history or de-duplication against previously-built exams.
- Any cloud backup or sync of bank content or override files — the
  thumbdrive is the sole source of truth; losing it loses the bank.

## Testing

Manual verification (no unit-test framework in `web/`, consistent with
this repo's other recent plans):
1. Connect the authorized drive → access granted. Connect an unauthorized
   or random drive → access refused with a clear message.
2. Import a real sample bank → question count and category names shown
   in the app match what's actually in the source file.
3. Random draw by category, then manually swap/add/remove → working list
   reflects every change correctly.
4. Edit a question's text or answer → reload the bank → edited value
   shows (override persisted to the drive-side sidecar file).
5. Generate the exam paper and answer key → both download, correct
   question order, correct content, answer key matches the exam paper.
6. Save a built exam, reload the page (drive still connected) → the
   saved question set pre-loads without re-picking.
7. Disconnect the drive, reopen a previously-built exam → saved reference
   still shows, but PDF regeneration is blocked with a clear reconnect
   prompt.
8. Spot-check the exam's Firestore doc (via the local emulator sandbox) →
   contains only `bankFileName`/`questionIds`/`pointsById`, never question
   text or answers.

## Implementation process note

Per project convention, once this is implemented the impeccable skill
should be run over the new UI (Test Bank browse screen, exam-builder flow,
question editor) before considering the feature done.
