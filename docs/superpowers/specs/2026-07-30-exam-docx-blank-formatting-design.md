# Exam Paper Blank-Line Formatting — Design

## Problem

The generated exam paper's fill-in-the-blank lines — both the cover page's
Name/Lawson write-in line and every question's answer blank — have gone
through several rounds of fixes this session (page-size/margin, embedded
blank placement, cover-row height, one-line vs. two-line layout) and the
user is still seeing blanks read as missing after downloading and opening
the actual generated file.

Direct inspection of the user's actual downloaded file
(`Test - Exam Paper (10).docx`) confirms the blanks *are* present in the
document's XML, correctly formatted as `<w:u w:val="single"/>` (underline)
runs of space characters, on both the cover line and every question. The
data is there; it just isn't rendering as visible for the user.

Direct inspection of the reference file (`Example-student.docx`) shows it
uses two different techniques for its two kinds of blank:

- **Cover page Name/Lawson line:** a single run of plain typed text —
  `"Name: __________________________ Lawson: ________________"` (26
  underscores, then 16) — no underline formatting at all.
- **Question body blanks:** the same underline-on-whitespace technique this
  app already uses.

Since the user's own generated file proves underline-on-whitespace runs are
present but not visibly rendering, and the reference file's question blanks
use that same technique, matching the reference's technique for question
blanks would not resolve the reported issue — it would only resolve the
cover line (which was already visibly failing) while leaving question
blanks exposed to the same, still-unexplained rendering problem.

## Fix

Stop using underline-as-decoration for any blank in this document. Every
blank line — cover page and every question — becomes plain typed underscore
characters instead: real text, not formatting applied to invisible
characters, so there's nothing for a renderer, print path, or converter to
silently drop.

### Cover page (`coverPageTable` in `web/src/lib/examDocx.js`)

Replace the current multi-run Name/Lawson paragraph with a single `TextRun`,
structurally identical to the reference's own single `<w:t>` run:

```
"Name: " + "_".repeat(26) + " Lawson: " + "_".repeat(16)
```

No underline property anywhere in this paragraph.

### Question blanks (`stemRuns` / `questionParagraph`)

A question's blank is currently detected by `EMBEDDED_BLANK_PATTERN`
(3+ spaces or 2+ underscores in the source stem text) and replaced with an
underlined run of spaces (`blankLine()`). This changes to:

- Every detected blank (regardless of the source's original marker —
  underscores or spaces — and regardless of its original length, which
  varies from ~9 to ~35+ characters in the real bank data, sized for LXR
  Test's own renderer, not ours) is replaced with a plain `TextRun` of 20
  underscore characters. Fixed length, no underline.
- If a stem has no blank marker at all (a genuine short-answer-style
  question, common in the real bank — e.g. "How many gallons... ?"), the
  fallback still appends one blank at the end, now as the same 20-underscore
  plain run instead of an underlined space run.
- The answer key's compact marker (`" ____ "`, shown between stem text and
  the printed answer) is already plain underscore text — unchanged.

### Cleanup

`blankLine()` becomes unused once every call site above switches to plain
underscore `TextRun`s, and is deleted — so there is no remaining code path
in this file that can produce an invisible-decoration blank.

### Out of scope

- Cover-row height (`HeightRule.ATLEAST`, set in the prior fix this
  session) is unrelated to this bug and unchanged.
- No change to how blanks are detected in source stem text
  (`EMBEDDED_BLANK_PATTERN`) — only how a detected blank is *rendered*.

**Files touched:** `web/src/lib/examDocx.js`.

## Testing

No unit-test framework is installed in `web/`, and this environment has no
way to render a `.docx` to a pixel image (no LibreOffice/Word available via
CLI). Verification is:

1. `npm run build` — confirm no compile errors.
2. Generate a sample exam paper from the real code path (same
   copy-and-stub-the-Vite-asset-import harness used earlier this session)
   using a mix of real bank stem text: underscore-marked blanks, space-marked
   blanks, multiple blanks in one stem, and a stem with no blank marker at
   all.
3. Unzip the generated `.docx` and grep its `word/document.xml` for
   `<w:u` — must find **zero** matches anywhere in the document (proves no
   underline-based blank remains).
4. Confirm the Name/Lawson line's raw text matches
   `"Name: " + 26 underscores + " Lawson: " + 16 underscores"` exactly, in a
   single run.
5. Confirm each sample question's blank is exactly 20 underscore characters,
   placed where the original marker was (mid-sentence) or appended at the
   end (no-marker case).
6. Ask the user to open the newly generated file themselves and confirm the
   blanks are visible before considering this closed — XML inspection proves
   the data is correct but cannot prove the user's own rendering path is
   satisfied.
