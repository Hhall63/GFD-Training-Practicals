# Exam Paper Blank-Line Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every underline-formatted blank line in the generated exam paper (cover page Name/Lawson line, every question's answer blank) with plain typed underscore characters, so no blank in the document depends on formatting decoration a viewer/print path could silently drop.

**Architecture:** Single-file change to `web/src/lib/examDocx.js`. No new dependencies, no data model changes, no UI changes — this only touches how two existing functions (`coverPageTable`, `stemRuns`) construct `TextRun`s.

**Tech Stack:** `docx` npm package (client-side .docx generation), Node.js for verification scripts (no browser needed to test this).

## Global Constraints

- Cover line text must be exactly: `"Name: " + 26 underscores + " Lawson: " + 16 underscores`, matching the reference document (`C:\Users\ffhal\Downloads\Example-student.docx`) byte-for-byte in a single run, per `docs/superpowers/specs/2026-07-30-exam-docx-blank-formatting-design.md`.
- Every question blank (source underscores, source spaces, or no marker at all) renders as a plain-text run of exactly 20 underscore characters — no `underline` property anywhere on any blank run in the whole document.
- The answer key's compact `" ____ "` marker is already correct (plain text) and must not change.
- No unit-test framework is installed in `web/` (consistent with every other plan in this repo) — verification is a Node script that generates a real `.docx` via the actual `examDocx.js` code and inspects its raw XML, run directly with `node`, not through a test runner.

---

### Task 1: Cover page Name/Lawson line — plain underscores, single run

**Files:**
- Modify: `web/src/lib/examDocx.js` (the `coverPageTable` function, currently ~lines 117–128, which pushes the Name/Lawson `Paragraph`)

**Interfaces:**
- Consumes: nothing new — `coverPageTable(logoBuffer, { classNumber, coverExamName })` keeps its existing signature.
- Produces: nothing new for later tasks — this is a self-contained change to one paragraph's construction.

- [ ] **Step 1: Write the verification script (the "test") before changing anything**

Create `web/verify-blanks.mjs` — a runnable copy of the real generation code, stubbing only the Vite-specific asset import (everything else is the actual `examDocx.js` logic, copy-pasted so it runs under plain Node):

```js
import { readFileSync, writeFileSync } from "fs";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, VerticalAlign, HeightRule, BorderStyle,
} from "docx";

const logoUrl = "src/assets/work-hard-be-humble.jpg";
const DEPARTMENT_NAME = "Greensboro Fire Department Training Division";
const PAGE_SIZE = { width: 12240, height: 15840 };
const PAGE_MARGIN = { top: 720, right: 720, bottom: 720, left: 720 };
const PAGE_WIDTH_DXA = 11520;
const COVER_ROW_HEIGHT_DXA = 13400;
const LOGO_WIDTH_PX = 390;
const LOGO_HEIGHT_PX = 540;
const DEPARTMENT_NAME_SIZE = 72;
const CLASS_LINE_SIZE = 66;
const EXAM_NAME_SIZE = 66;
const NAME_ID_LINE_SIZE = 40;
const QUESTION_SIZE = 32;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const TABLE_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

let logoBufferPromise = null;
function loadLogoBuffer() {
  if (!logoBufferPromise) logoBufferPromise = Promise.resolve(readFileSync(logoUrl));
  return logoBufferPromise;
}

// --- Paste the real coverPageTable, answerKeyHeaderParagraphs, EMBEDDED_BLANK_PATTERN,
//     stemRuns, questionParagraph, buildExamPaperDocx, buildAnswerKeyDocx bodies from
//     web/src/lib/examDocx.js verbatim below this line. ---
```

Then, in the same file, add a runner at the bottom:

```js
const sampleQuestions = [
  { quesId: 1, category: "Sample", stemText: "The hydrant's main valve is located at the__________ of the hydrant.", answerText: "base", points: 1 },
  { quesId: 2, category: "Sample", stemText: "Water main valves should be spaced no more than                  feet apart in high value districts and                 feet apart in other areas.", answerText: "n/a", points: 1 },
  { quesId: 3, category: "Sample", stemText: "How many gallons of water are in one cubic foot?", answerText: "7.48", points: 1 },
];
const blob = await buildExamPaperDocx({ classNumber: "83", coverExamName: "Exam 1", questions: sampleQuestions });
const buf = Buffer.from(await blob.arrayBuffer());
writeFileSync("verify-out.docx", buf);
console.log("wrote verify-out.docx", buf.length, "bytes");
```

**Files:**
- Create: `web/verify-blanks.mjs` (temporary — deleted in Task 2's last step)

- [ ] **Step 2: Run the script and confirm it currently fails the correctness bar**

```bash
cd web && node verify-blanks.mjs && rm -rf verify-unzip && mkdir -p verify-unzip && cd verify-unzip && unzip -o -q ../verify-out.docx -d . && grep -c '<w:u ' word/document.xml
```

Expected: a non-zero count (the current code still uses `<w:u w:val="single"/>` for both the cover line and every question blank) — this confirms the script correctly detects the underline-based blanks that Task 1/2 need to eliminate.

- [ ] **Step 3: Modify `coverPageTable` in `web/src/lib/examDocx.js`**

Replace the current Name/Lawson paragraph push (the block using `TextRun({ text: "Name:", ... })`, `blankLine(...)`, `TextRun({ text: " Lawson:", ... })`, `blankLine(...)`) with:

```js
  // Single plain-text run, byte-for-byte matching the reference document's own cover line —
  // no underline formatting. Verified against the user's actual downloaded file that
  // underline-on-whitespace runs can be present in the XML yet not render visibly; a typed
  // underscore is a real character no renderer can silently drop.
  cellChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Name: ${"_".repeat(26)} Lawson: ${"_".repeat(16)}`,
          size: NAME_ID_LINE_SIZE,
        }),
      ],
    })
  );
```

- [ ] **Step 4: Update `web/verify-blanks.mjs`'s pasted `coverPageTable` body to match, re-run, and confirm the cover line is now correct**

```bash
cd web && node verify-blanks.mjs && rm -rf verify-unzip && mkdir -p verify-unzip && cd verify-unzip && unzip -o -q ../verify-out.docx -d . && node -e "
const fs = require('fs');
const xml = fs.readFileSync('word/document.xml', 'utf8');
const m = xml.match(/<w:t[^>]*>Name: [^<]*<\/w:t>/);
console.log(JSON.stringify(m && m[0]));
"
```

Expected output contains exactly: `Name: __________________________ Lawson: ________________` (26 underscores, then 16), inside a single `<w:t>` with no sibling `<w:u>` in that run's `<w:rPr>`.

- [ ] **Step 5: Commit**

```bash
cd .. && git add web/src/lib/examDocx.js && git commit -m "$(cat <<'EOF'
fix: render the cover page Name/Lawson line as plain underscores

Matches the reference document's own technique for this line exactly
-- a single run of typed underscore characters, no underline
formatting. The user's actual downloaded file proved underline-on-
whitespace runs can be present in the XML yet not render visibly; a
typed underscore is a real character no renderer can silently drop.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RWxhFEMTZcDHfQmeAd7yy1
EOF
)"
```

---

### Task 2: Question blanks — plain underscores, fixed length, remove `blankLine()`

**Files:**
- Modify: `web/src/lib/examDocx.js` (the `stemRuns` function, currently ~lines 175–190, and the now-unused `blankLine` helper, currently ~lines 68–72)
- Delete: `web/verify-blanks.mjs`, `web/verify-out.docx`, `web/verify-unzip/` (Step 5)

**Interfaces:**
- Consumes: `EMBEDDED_BLANK_PATTERN` (unchanged — still `/ {3,}|_{2,}/g`, matching 3+ spaces or 2+ underscores in source `stemText`).
- Produces: `stemRuns(stemText, size, withBlank)` keeps its existing signature and is still called the same way from `questionParagraph`.

- [ ] **Step 1: Confirm the still-failing case in the verification script**

Using the same `verify-out.docx` from Task 1, question blanks still use underline:

```bash
cd web/verify-unzip && grep -o '<w:u w:val="single"/></w:rPr><w:t[^>]*>[^<]*</w:t>' word/document.xml | grep -v Lawson | grep -v Name
```

Expected: one match per question blank (3 matches, for the 3 sample questions), each an underlined run of space characters — this is what Step 3 below eliminates.

- [ ] **Step 2: Modify `stemRuns` in `web/src/lib/examDocx.js`**

Replace the function body:

```js
/** withBlank: true for the exam paper (a blank to write the answer, in place of the bank's
 * embedded blank marker), false for the answer key (a compact marker plus the real answer
 * text appended). Every blank -- regardless of the source's original marker (underscores or
 * spaces) or length (varies ~9-35+ characters in the real bank data, sized for LXR Test's own
 * renderer, not ours) -- becomes a fixed-length run of plain underscore characters. No
 * underline formatting anywhere: proven by inspecting the user's actual downloaded file that
 * underline-on-whitespace runs can be present yet not render visibly in their environment. */
function stemRuns(stemText, size, withBlank) {
  const blankRun = () => new TextRun({ text: "_".repeat(20), size });
  const parts = stemText.split(EMBEDDED_BLANK_PATTERN);
  if (parts.length === 1) {
    const runs = [new TextRun({ text: `${stemText.trim()} `, size })];
    if (withBlank) runs.push(blankRun());
    return runs;
  }
  const runs = [];
  parts.forEach((part, i) => {
    if (part) runs.push(new TextRun({ text: part, size }));
    if (i < parts.length - 1) {
      runs.push(withBlank ? blankRun() : new TextRun({ text: " ____ ", size }));
    }
  });
  return runs;
}
```

- [ ] **Step 3: Delete the now-unused `blankLine` helper**

Remove this function entirely from `web/src/lib/examDocx.js`:

```js
/** A run of underlined blank spaces — real Word underline formatting, not just
 * whitespace, so it renders as a clearly visible line to write on. */
function blankLine(size, spaceCount) {
  return new TextRun({ text: " ".repeat(spaceCount), size, underline: {} });
}
```

- [ ] **Step 4: Update `web/verify-blanks.mjs`'s pasted `stemRuns` body to match (delete its `blankLine` too), re-run, and confirm zero underline runs remain anywhere in the document**

```bash
cd web && node verify-blanks.mjs && rm -rf verify-unzip && mkdir -p verify-unzip && cd verify-unzip && unzip -o -q ../verify-out.docx -d . && grep -c '<w:u ' word/document.xml
```

Expected: `0` (or the grep command exits with status 1 and prints nothing, meaning no matches at all) — confirms no `<w:u>` element exists anywhere in the generated document.

Also confirm each sample question's blank is exactly 20 underscores and correctly placed:

```bash
node -e "
const fs = require('fs');
const xml = fs.readFileSync('word/document.xml', 'utf8');
const matches = xml.match(/<w:t[^>]*>_{20}<\/w:t>/g) || [];
console.log('20-underscore runs found:', matches.length);
"
```

Expected: `20-underscore runs found: 4` — question 1 has 1 embedded blank, question 2 has 2 embedded blanks in one stem, question 3 has no marker at all so the fallback appends 1 at the end: 1 + 2 + 1 = 4. If the printed count is anything else, check whether `EMBEDDED_BLANK_PATTERN` matched both blanks in question 2's stem before concluding Step 2 is wrong.

- [ ] **Step 5: Run the real build, then delete the temporary verification files**

```bash
npm run build
```

Expected: builds cleanly with no errors (same as every prior build check this session).

```bash
rm -f verify-blanks.mjs verify-out.docx && rm -rf verify-unzip
```

- [ ] **Step 6: Commit**

```bash
cd .. && git add web/src/lib/examDocx.js && git commit -m "$(cat <<'EOF'
fix: render every question's answer blank as plain underscores

Same fix as the cover-page Name/Lawson line, applied to every
question: a detected blank (source underscores, source spaces, or no
marker at all) is now a fixed 20-character plain-text underscore run
instead of an underlined run of space characters. blankLine() is now
unused and removed -- no code path in this file can produce an
invisible-decoration blank anymore.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RWxhFEMTZcDHfQmeAd7yy1
EOF
)"
git push
```

---

### Task 3: Ask the user to confirm against the actual rendered file

**Files:** none — this is a verification-only task, no code changes.

**Interfaces:** none.

- [ ] **Step 1: Tell the user the fix is pushed and ask them to regenerate and open a fresh exam paper**

XML inspection (Tasks 1 and 2) proves the generated data is correct, but cannot prove the user's own viewer renders it as expected — that's the entire premise of this bug (the previous underline-based blanks were also structurally correct and still didn't render for them). Ask them to hard-refresh, generate a new Exam Paper, and confirm both the cover line and every question's blank are now visible before this is considered closed.
