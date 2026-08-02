# Test Bank — A/B Exam Versions — Design

Extends the existing Test Bank builder (`docs/superpowers/specs/2026-07-28-test-bank-lxrbank-import-design.md`)
so that finalizing a working set produces two parallel versions of the same
exam — Version A in the order questions were added, Version B a shuffle of
the same questions — each with its own matching answer key, instead of the
single unordered pair generated today.

## Problem

Today "Finalize & Export" generates one exam paper and one answer key from
the working set, sorted by category then bank sequence. GFD wants two
distinct printed forms of the same exam (a standard anti-copying practice
for in-person written tests): Version A holding the questions in the order
the admin assembled them, and Version B holding the same questions
reshuffled into a different order — each version needs a paper that
students write on and an answer key an evaluator grades from, both correctly
numbered for that version's own order.

## Scope

This replaces the existing single-version Generate Exam Paper / Generate
Answer Key buttons entirely — there is no separate "single version" mode
left after this change. It does not touch drive authentication, parsing,
browsing, editing, or the random-draw/manual-add mechanics of assembling a
working set (`docs/superpowers/specs/2026-07-28-test-bank-lxrbank-import-design.md`
covers all of that unchanged).

## Data Model

`templates/{examId}.testBank` gains one field alongside the existing ones:

```
templates/{examId}.testBank = {
  bankFileName: string,
  questionIds: number[],       // unchanged — insertion order = Version A order
  bQuestionIds: number[],      // NEW — same IDs as questionIds, shuffled = Version B order
  pointsById: { [quesId]: number },
  importedAt: Timestamp,
  lastBuiltAt: Timestamp,
}
```

`bQuestionIds` is computed by `saveTestBankReference` itself, not passed in
by the caller: every "Save Question Set" click generates a fresh
Fisher-Yates shuffle of the current `questionIds` and saves both arrays
together. Like `questionIds`, this is an opaque ID list — it carries no
question text or answers, so it fits the existing "nothing sensitive in
Firestore" model unchanged.

Exams saved before this change simply have no `bQuestionIds` field; the
next Save populates it. No migration needed.

## Builder UI Changes (`TestBankBuilder.jsx`)

**Working Set panel (step 3)** switches from its current
category-then-sequence sort to plain insertion order. This is Version A's
order, so what the admin sees in this panel is exactly what will print —
no hidden reordering between what's shown and what's generated.

**Finalize & Export (step 4)** replaces the two existing buttons with two
new ones:
- **Generate Version A** — always enabled once Class Number, Exam Name, and
  a non-empty working set are present (same validation as today). Uses the
  live working set's current order — no save required, matching today's
  behavior for the single-version buttons.
- **Generate Version B** — same validation, plus one more: disabled, with
  a hint ("Save Question Set to lock in Version B"), unless the current
  working set's question IDs are exactly the same set as the last-saved
  `bQuestionIds`'s ID set. This is what makes B "fixed once, reproducible"
  per GFD's request: editing the working set after generating B and not
  re-saving can't silently print a stale or mismatched shuffle. Once
  enabled, Generate Version B always uses the saved `bQuestionIds` order,
  not a newly-computed shuffle — regenerating (e.g. reprinting a lost copy)
  reproduces the exact same B order every time, across sessions.

Each button click downloads two files together (paper + key for that
version), matching the filename pattern already in use:
- `"{examName} - A - Exam Paper.docx"`, `"{examName} - A - Answer Key.docx"`
- `"{examName} - B - Exam Paper.docx"`, `"{examName} - B - Answer Key.docx"`

(`examName` here is the exam's existing admin-side name, same source the
current single-version filenames already use — not the cover-page Exam
Name field.)

The cover-page Exam Name text itself gets a version suffix appended by the
builder before calling the document functions — `"-A"` or `"-B"` directly
appended, no space (e.g. entering "Exam 1" produces a cover page reading
"Exam 1-A" for Version A's paper and key, "Exam 1-B" for Version B's).
`examDocx.js` has no notion of versions; it just renders whatever cover
text string it's given, called twice with two different strings.

## Document Generation Changes (`examDocx.js`)

**Cover page stays visually identical between the exam paper and the answer
key** — same department name, logo, class-number line, exam-name line,
page-break-then-content structure — except for the bottom line:
- Exam paper: today's Name/Lawson write-in blank, unchanged.
- Answer key: a bold "Answer Key" line instead.

This is implemented as a `footer` parameter on the existing
`coverPageTable()` helper (a `{ text, bold }`-shaped run description)
rather than two divergent cover implementations. `buildAnswerKeyDocx` now
calls `coverPageTable()` with the "Answer Key" footer instead of building
its own compact header — the old `answerKeyHeaderParagraphs` function and
its 90×125px small logo are deleted entirely, since the answer key gets the
full-size cover treatment now. The `examName` fallback parameter on
`buildAnswerKeyDocx` is dropped; `coverExamName` (already required in the
UI, suffix already applied by the caller) is always present.

Question rendering (numbering, embedded-blank handling, answer-key answer
text) is unchanged — only which order the `questions` array arrives in
differs between an A call and a B call, and that ordering is resolved by
the caller (`TestBankBuilder.jsx`), not `examDocx.js` itself.

## Error Handling

- Generate Version B is disabled (not silently wrong) whenever the working
  set has changed since the last save — covered above.
- All error handling from the original Test Bank design (drive
  disconnected, unauthorized drive, corrupt bank, unsupported question
  type, missing bank file on regeneration) is unchanged and untouched by
  this feature.

## Non-goals

- Any change to drive auth, parsing, browsing, or editing.
- More than two versions (no "Version C").
- Persisting or downloading any content beyond the two docx files per
  version — same "nothing sensitive leaves the drive except opaque IDs"
  model as the original design.

## Testing

Manual verification (no unit-test framework in `web/`, consistent with
this repo's other recent plans):
1. Build a working set by mixing random draw and manual add/remove →
   the Working Set panel shows questions in the order they were added, not
   grouped by category.
2. Click Generate Version A without saving → paper + key download,
   question order matches the Working Set panel exactly, cover page reads
   "{Exam Name}-A", key's cover page reads "Answer Key" in place of
   Name/Lawson, everything else on both covers matches.
3. Attempt Generate Version B before ever saving → button disabled with
   the "Save Question Set" hint.
4. Click Save Question Set → Generate Version B becomes enabled → paper +
   key download, same question set as A but different order, cover reads
   "{Exam Name}-B", key content (stem + answer) matches each question
   correctly for B's own order and numbering.
5. Regenerate Version B again (same working set, no edits) → identical
   order to the previous B download (reproducible shuffle).
6. Add or remove a question from the working set without re-saving →
   Generate Version B becomes disabled again with the hint.
7. Save again after that edit → Generate Version B re-enabled with a new
   shuffle reflecting the updated set.
8. Reload the page (drive still connected, exam previously saved) → both
   Generate Version A and Generate Version B work immediately using the
   saved `questionIds`/`bQuestionIds` without needing to rebuild the
   working set.

## Implementation process note

Per project convention, once this is implemented the impeccable skill
should be run over the affected UI (Working Set panel reorder, the two new
buttons, the disabled/hint state) before considering the feature done —
though given this session's explicit end-to-end go-ahead (merge + deploy),
treat this as an optional polish pass rather than a blocking step.
