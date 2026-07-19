# Retake Rows in Same Size/Format — Design

## Goal

On every printable report that shows a test's retake (Class Reports, Summary Transcript,
Complete Transcript), render the retake as a full-size row identical in layout to the
original result row, instead of today's small, muted, indented sub-line.

## Current behavior

`TranscriptLineItem.jsx` renders one full-size row for the original attempt (test name —
PASS/FAIL badge — date — evaluator), and, when a retake exists, a second, visually
de-emphasized line beneath it: 12px muted text, indented, no badge — "Retake: `date` —
`PASS/FAIL` — by `evaluator`".

## New behavior

- The original row is unchanged: test name — PASS/FAIL badge — date — evaluator.
- When `item.retake` is present, render a second row using the **same markup/classes as the
  original row** (same font size, same badge styling, same flush-left column layout) with
  `"Retake"` in place of the test name: `Retake` — PASS/FAIL badge — date — evaluator.
- No indentation on the retake row — it sits flush left, same as the original.
- Both rows stay inside the same `.transcript-line-item` container, so the pair still shares
  one bottom border/grouping — visually still reads as "these two rows are the same test,"
  without shrinking the retake row to do it.
- Applies everywhere `TranscriptLineItem` is used: `ClassReportPage.jsx`,
  `TranscriptSummaryPage.jsx`, `TranscriptCompletePage.jsx` — all three consume the same
  component the same way, so one change covers all of them.

## What does not change

- `resolveEffectiveSession` / `buildTranscriptLineItems` (`web/src/lib/reportsData.js`) are
  untouched. Still exactly one retake tracked (the latest), shown only when present. This is
  a pure presentation change.
- No data model change, no new Firestore fields, no route/screen additions.

## Files touched

- `web/src/components/TranscriptLineItem.jsx` — retake branch renders a second full row
  (label `"Retake"`, badge, date, evaluator) using the same row markup as the original,
  instead of the current small muted plain-text line.
- `web/src/styles/print.css` — remove `.transcript-line-item-retake`'s small/muted/indented
  styling (12px, `padding-left`, `margin-top`); the retake row reuses
  `.transcript-line-item-main`'s layout instead.

## Edge cases

- No retake: unchanged — only the original row renders, no empty second row.
- Retake FAILs after an original FAIL (or any other pass/fail combination): both rows always
  render with their own independent PASS/FAIL badge coloring — no special-casing based on
  which combination it is.

## Testing

- Manual (`web:verify`): print-preview a Class Report and both Transcript pages for a recruit
  with at least one retake; confirm the retake row matches the original row's font size,
  badge style, and column alignment, with "Retake" as its label and no indentation. Confirm a
  recruit/test with no retake still shows only the single original row.
