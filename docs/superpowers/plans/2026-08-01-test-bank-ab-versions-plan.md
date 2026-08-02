# Test Bank A/B Exam Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Test Bank builder's single exam-paper/answer-key generation with two versions — Version A (working-set insertion order) and Version B (a shuffle of the same set, computed once and saved so it's reproducible) — each downloading its own matching paper + key, with the answer key now sharing the exam paper's full cover page (swap only the bottom line for "Answer Key").

**Architecture:** Three existing files change, no new files, no new dependencies. `testBankExam.js` gains a shuffle computed at save time; `examDocx.js`'s cover-page builder takes a `footer` parameter instead of hardcoding the Name/Lawson line, so the exam paper and answer key can share it; `TestBankBuilder.jsx` stops re-sorting the working set (so display order = Version A order), adds a same-ID-set check that gates the new Version B button, and replaces the two generate buttons with two version buttons that each produce a paper+key pair.

**Tech Stack:** React (existing component), `docx` npm package (existing dependency, no version change), Firestore via the existing `firebase/firestore` SDK, Node.js for scratch verification scripts (no unit-test framework in `web/`, consistent with every other plan in this repo).

## Global Constraints

- `bQuestionIds` is computed by `saveTestBankReference` itself (Fisher-Yates shuffle of `questionIds`), never passed in by a caller — per `docs/superpowers/specs/2026-08-01-test-bank-ab-versions-design.md`.
- Cover-page exam name suffix: `"-A"` / `"-B"` appended directly to the entered Exam Name with no space (e.g. `"Exam 1-A"`).
- Downloaded filenames: `"{examName} - A - Exam Paper.docx"`, `"{examName} - A - Answer Key.docx"`, `"{examName} - B - Exam Paper.docx"`, `"{examName} - B - Answer Key.docx"` — `examName` is the exam's admin-side name (existing `examName` prop), not the cover-page Exam Name field.
- Generate Version A has no save precondition (matches today's ungated single-version behavior). Generate Version B is disabled until the working set's current question-ID set exactly matches the saved `bQuestionIds`'s ID set.
- No unit-test framework exists in `web/` — verification uses scratch Node scripts (generate real output, inspect it directly) per this repo's established convention, deleted once each task's check passes.

---

### Task 1: Persist a reproducible B-order shuffle

**Files:**
- Modify: `web/src/lib/testBankExam.js` (whole file, currently 26 lines)

**Interfaces:**
- Consumes: nothing new.
- Produces: `saveTestBankReference(examId, { bankFileName, questionIds, pointsById })` — same call signature as today (unchanged; callers do not need to know about `bQuestionIds`) — but its resolved/returned `testBank` object now always includes a `bQuestionIds: number[]` field, a shuffled permutation of `questionIds`. Task 3 reads this field off the `savedReference` prop.

- [ ] **Step 1: Write the verification script (the "test") before changing anything**

Create `web/verify-shuffle.mjs`:

```js
// Scratch verification for testBankExam.js's shuffle helper — pure logic, no Firebase
// needed, so this duplicates just the shuffle function rather than importing the real
// module (which requires a live `db` import). Deleted at the end of this task.
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const original = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];

// 1. Same elements, same length, original untouched (no in-place mutation).
const result = shuffle(original);
const sameLength = result.length === original.length;
const sameElements = [...result].sort((a, b) => a - b).join(",") === [...original].sort((a, b) => a - b).join(",");
const originalUntouched = original.join(",") === "101,102,103,104,105,106,107,108,109,110";
console.log("same length:", sameLength);
console.log("same elements:", sameElements);
console.log("original untouched:", originalUntouched);

// 2. Across many trials, shuffles actually vary (not an accidental no-op).
let sawDifferentOrder = false;
for (let i = 0; i < 20; i++) {
  if (shuffle(original).join(",") !== original.join(",")) {
    sawDifferentOrder = true;
    break;
  }
}
console.log("saw a different order within 20 trials:", sawDifferentOrder);

if (!sameLength || !sameElements || !originalUntouched || !sawDifferentOrder) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
```

- [ ] **Step 2: Run it to confirm the shuffle logic itself is sound**

Run: `cd web && node verify-shuffle.mjs`
Expected: prints `same length: true`, `same elements: true`, `original untouched: true`, `saw a different order within 20 trials: true`, then `PASS`.

- [ ] **Step 3: Modify `web/src/lib/testBankExam.js`**

Replace the whole file with:

```js
// Reads/writes the safe, non-sensitive test-bank reference on an exam's template doc. Never
// touches question text/answers — see the design doc's Security section for what "safe"
// means here.
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

// Fisher-Yates. bQuestionIds is Version B's fixed, reproducible question order — computed
// once per save, not recomputed on every "Generate Version B" click, so reprinting a lost
// paper later reproduces the exact same order (docs/superpowers/specs/2026-08-01-test-bank-ab-versions-design.md).
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function saveTestBankReference(examId, { bankFileName, questionIds, pointsById }) {
  const ref = doc(db, "templates", examId);
  const existing = (await getDoc(ref)).data()?.testBank;
  const now = Timestamp.now();
  const testBank = {
    bankFileName,
    questionIds,
    bQuestionIds: shuffle(questionIds),
    pointsById,
    importedAt: existing?.importedAt ?? now,
    lastBuiltAt: now,
  };
  await updateDoc(ref, { testBank });
  return testBank;
}

export async function loadTestBankReference(examId) {
  const snap = await getDoc(doc(db, "templates", examId));
  return snap.data()?.testBank ?? null;
}
```

- [ ] **Step 4: Delete the scratch script and confirm the app still builds**

```bash
cd web && rm -f verify-shuffle.mjs && npm run build
```

Expected: clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/testBankExam.js && git commit -m "$(cat <<'EOF'
feat: save a reproducible shuffled B-order alongside the test bank reference

saveTestBankReference now computes bQuestionIds (a Fisher-Yates
shuffle of questionIds) every time the working set is saved, so
Version B's question order is fixed at save time and reproducible on
every later regeneration instead of reshuffled per click.
EOF
)"
```

---

### Task 2: Unify the answer key's cover page with the exam paper's

**Files:**
- Modify: `web/src/lib/examDocx.js` (the `coverPageTable` function at ~lines 78–152, `answerKeyHeaderParagraphs` at ~lines 154–172, `buildExamPaperDocx` at ~lines 226–241, `buildAnswerKeyDocx` at ~lines 243–257)

**Interfaces:**
- Consumes: nothing new.
- Produces: `coverPageTable(logoBuffer, { classNumber, coverExamName, footer })` — `footer` is `{ text: string, bold?: boolean }`, the paragraph rendered as the cover's bottom line. `buildAnswerKeyDocx({ classNumber, coverExamName, questions })` — signature changes: `examName` parameter is dropped, `classNumber` is newly required (both `buildExamPaperDocx` and `buildAnswerKeyDocx` now take the same three top-level keys). Task 3's `handleGenerate` calls both functions with these exact shapes.

- [ ] **Step 1: Write the verification script (the "test") before changing anything**

Create `web/verify-ab-cover.mjs`:

```js
// Scratch verification for examDocx.js's unified cover page — generates a real exam paper
// and a real answer key via the actual (soon-to-be-modified) functions, then inspects the
// raw XML. Deleted at the end of this task. Paste the real, current file bodies of
// coverPageTable, EMBEDDED_BLANK_PATTERN, stemRuns, questionParagraph,
// buildExamPaperDocx, buildAnswerKeyDocx from web/src/lib/examDocx.js below the stubs —
// after Step 3's edit, re-paste the updated versions before re-running.
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

// --- Paste coverPageTable, EMBEDDED_BLANK_PATTERN, stemRuns, questionParagraph,
//     buildExamPaperDocx, buildAnswerKeyDocx bodies verbatim below this line. ---

const sampleQuestions = [
  { quesId: 1, category: "Sample", stemText: "The hydrant's main valve is located at the__________ of the hydrant.", answerText: "base", points: 1 },
  { quesId: 2, category: "Sample", stemText: "How many gallons of water are in one cubic foot?", answerText: "7.48", points: 1 },
];

const paperBlob = await buildExamPaperDocx({ classNumber: "83", coverExamName: "Exam 1-A", questions: sampleQuestions });
writeFileSync("verify-paper.docx", Buffer.from(await paperBlob.arrayBuffer()));
const keyBlob = await buildAnswerKeyDocx({ classNumber: "83", coverExamName: "Exam 1-A", questions: sampleQuestions });
writeFileSync("verify-key.docx", Buffer.from(await keyBlob.arrayBuffer()));
console.log("wrote verify-paper.docx and verify-key.docx");
```

Paste the **current** (unmodified) bodies of `coverPageTable`, `EMBEDDED_BLANK_PATTERN`, `stemRuns`, `questionParagraph`, `buildExamPaperDocx` from `web/src/lib/examDocx.js` verbatim in place of the comment, and — for this first run only — also paste the current `answerKeyHeaderParagraphs` and current `buildAnswerKeyDocx` (which still uses `examName`, so change the script's `buildAnswerKeyDocx` call for this run only to `{ examName: "Exam 1", coverExamName: "Exam 1-A", questions: sampleQuestions }`).

- [ ] **Step 2: Run it against the current code to confirm the answer key's cover is still the old compact one**

```bash
cd web && node verify-ab-cover.mjs && rm -rf verify-unzip && mkdir -p verify-unzip && cd verify-unzip && unzip -o -q ../verify-key.docx -d . && grep -c "Greensboro Fire Department Training Division" word/document.xml && grep -c "Answer Key" word/document.xml
```

Expected: the department name appears once (small compact header, not the full cover table), and no "Name:"/"Lawson" text — confirming today's answer key does NOT share the exam paper's cover. This is the gap Step 3 closes.

- [ ] **Step 3: Modify `web/src/lib/examDocx.js`**

Replace the `coverPageTable` function (currently lines 78–152) with:

```js
function coverPageTable(logoBuffer, { classNumber, coverExamName, footer }) {
  const cellChildren = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: DEPARTMENT_NAME, bold: true, size: DEPARTMENT_NAME_SIZE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [
        new ImageRun({ type: "jpg", data: logoBuffer, transformation: { width: LOGO_WIDTH_PX, height: LOGO_HEIGHT_PX } }),
      ],
    }),
  ];
  if (classNumber) {
    cellChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: `${ordinal(Number(classNumber))} Recruit Class`, size: CLASS_LINE_SIZE })],
      })
    );
  }
  if (coverExamName) {
    cellChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
        children: [new TextRun({ text: coverExamName, bold: true, size: EXAM_NAME_SIZE })],
      })
    );
  }
  // Bottom line is caller-supplied: the exam paper's Name/Lawson write-in blank and the
  // answer key's "Answer Key" label are the only two callers, and everything else about
  // this cover (logo, department name, class line, exam name) is identical between them —
  // docs/superpowers/specs/2026-08-01-test-bank-ab-versions-design.md.
  cellChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: footer.text,
          bold: footer.bold ?? false,
          size: NAME_ID_LINE_SIZE,
        }),
      ],
    })
  );

  return new Table({
    width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [PAGE_WIDTH_DXA],
    alignment: AlignmentType.CENTER,
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        height: { value: COVER_ROW_HEIGHT_DXA, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: TABLE_BORDERS,
            children: cellChildren,
          }),
        ],
      }),
    ],
  });
}
```

Delete `answerKeyHeaderParagraphs` entirely (currently lines 154–172, immediately below the function just replaced).

Replace `buildExamPaperDocx` (currently lines 226–241) with:

```js
export async function buildExamPaperDocx({ classNumber, coverExamName, questions }) {
  const logoBuffer = await loadLogoBuffer();
  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
        children: [
          coverPageTable(logoBuffer, {
            classNumber,
            coverExamName,
            footer: { text: `Name: ${"_".repeat(26)} Lawson: ${"_".repeat(16)}` },
          }),
          new Paragraph({ children: [new PageBreak()] }),
          ...questions.map((q, i) => questionParagraph(i, q, true)),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
```

Replace `buildAnswerKeyDocx` (currently lines 243–257) with:

```js
export async function buildAnswerKeyDocx({ classNumber, coverExamName, questions }) {
  const logoBuffer = await loadLogoBuffer();
  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
        children: [
          coverPageTable(logoBuffer, {
            classNumber,
            coverExamName,
            footer: { text: "Answer Key", bold: true },
          }),
          new Paragraph({ children: [new PageBreak()] }),
          ...questions.map((q, i) => questionParagraph(i, q, false)),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
```

- [ ] **Step 4: Update the scratch script to match and confirm the answer key now shares the full cover**

In `web/verify-ab-cover.mjs`, replace the pasted `coverPageTable`/`buildExamPaperDocx`/`buildAnswerKeyDocx` bodies with the new versions above, delete the pasted `answerKeyHeaderParagraphs` (no longer exists), and change the `buildAnswerKeyDocx` call back to `{ classNumber: "83", coverExamName: "Exam 1-A", questions: sampleQuestions }` (matching the real new signature — the script's earlier "for this run only" `examName` variant was scaffolding for Step 2's before/after comparison, not the final call).

```bash
cd web && node verify-ab-cover.mjs && rm -rf verify-unzip && mkdir -p verify-unzip && cd verify-unzip && unzip -o -q ../verify-key.docx -d . && grep -c "Greensboro Fire Department Training Division" word/document.xml && grep -o "<w:t[^>]*>Answer Key</w:t>" word/document.xml && grep -c "Name:" word/document.xml
```

Expected: department name count is now `1` but the surrounding structure matches the full cover table (confirm visually by also running the same three greps against `verify-paper.docx` and diffing the department-name/logo/class-line portion of the XML — should be structurally identical up to the final line); `Answer Key` run is found; `Name:` count is `0` (the answer key's cover has no Name/Lawson text). Also confirm the exam name suffix rendered: `grep -o "<w:t[^>]*>Exam 1-A</w:t>" word/document.xml` finds one match in each of `verify-paper.docx` and `verify-key.docx`.

- [ ] **Step 5: Confirm the dead code is actually gone from the real source file, not just the scratch copy**

```bash
cd web && grep -n "answerKeyHeaderParagraphs" src/lib/examDocx.js
```

Expected: no output (grep exits non-zero, nothing found).

- [ ] **Step 6: Build clean, then delete the scratch files**

```bash
cd web && npm run build && rm -f verify-ab-cover.mjs verify-paper.docx verify-key.docx && rm -rf verify-unzip
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/examDocx.js && git commit -m "$(cat <<'EOF'
feat: give the answer key the same cover page as the exam paper

coverPageTable now takes a caller-supplied footer instead of always
hardcoding the Name/Lawson blank, so buildAnswerKeyDocx can reuse the
exact same full cover (department name, logo, class line, exam name)
and just swap the bottom line for a bold "Answer Key" label. The old
compact answerKeyHeaderParagraphs header is removed.
EOF
)"
```

---

### Task 3: Two-version Generate buttons in the builder

**Files:**
- Modify: `web/src/components/TestBankBuilder.jsx` (whole file, currently 369 lines)

**Interfaces:**
- Consumes: `saveTestBankReference` (Task 1, unchanged call signature, resolved value now includes `bQuestionIds`), `buildExamPaperDocx`/`buildAnswerKeyDocx` (Task 2, new shared `{ classNumber, coverExamName, questions }` shape), `savedReference` prop (already passed by `TestBankPage.jsx`, now also carries `bQuestionIds` after a save).
- Produces: nothing new for other files — this is the last task in the chain.

- [ ] **Step 1: Write the verification script for the pure `sameIdSet` logic (the "test") before changing anything**

Create `web/verify-sameidset.mjs`:

```js
// Scratch verification for TestBankBuilder.jsx's sameIdSet helper — pure logic, no React
// needed. Deleted at the end of this task.
function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

const checks = [
  [sameIdSet([1, 2, 3], [3, 2, 1]), true, "same elements, different order"],
  [sameIdSet([1, 2, 3], [1, 2]), false, "different length"],
  [sameIdSet([1, 2, 3], [1, 2, 4]), false, "one element differs"],
  [sameIdSet([], []), true, "both empty"],
  [sameIdSet([1, 2], []), false, "one empty, one not"],
];

let allPass = true;
for (const [actual, expected, label] of checks) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label} (got ${actual}, expected ${expected})`);
  if (!ok) allPass = false;
}
if (!allPass) process.exit(1);
console.log("ALL PASS");
```

- [ ] **Step 2: Run it to confirm the logic is sound**

Run: `cd web && node verify-sameidset.mjs`
Expected: five `PASS` lines, then `ALL PASS`.

- [ ] **Step 3: Modify `web/src/components/TestBankBuilder.jsx`**

Add `sameIdSet` next to the existing `pickRandom` helper (currently lines 8–16):

```js
function pickRandom(list, count) {
  const pool = [...list];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

// Used to gate "Generate Version B": the saved shuffle is only valid for the exact
// question set it was computed from, not a superset/subset after further edits.
function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}
```

Change the `workingQuestions` memo (currently lines 49–56) to drop the sort — insertion order in `workingIds` IS Version A's order, so the Working Set panel now shows exactly what will print:

```js
  const workingQuestions = useMemo(
    () => workingIds.map((id) => questionsById.get(id)).filter(Boolean),
    [workingIds, questionsById]
  );
```

Add a `workingBQuestions` memo right after it, plus the `bAvailable` gate, both derived from the `savedReference` prop (already passed in from `TestBankPage.jsx`, and re-passed with a fresh value after every `onSaved` call):

```js
  const savedBIds = savedReference?.bQuestionIds ?? [];
  const workingBQuestions = useMemo(
    () => savedBIds.map((id) => questionsById.get(id)).filter(Boolean),
    [savedBIds, questionsById]
  );
  const bAvailable = savedBIds.length > 0 && sameIdSet(workingIds, savedBIds);
```

Place these two lines and the memo directly after the existing `workingQuestions` memo, before `browseList` (currently starting at line 57).

Replace `handleGenerate` (currently lines 102–114) with:

```js
  async function handleGenerate(version) {
    setGenerating(version);
    try {
      const versionQuestions = version === "A" ? workingQuestions : workingBQuestions;
      const versionCoverName = `${coverExamName}-${version}`;
      const paperBlob = await buildExamPaperDocx({ classNumber, coverExamName: versionCoverName, questions: versionQuestions });
      downloadDocxBlob(paperBlob, `${examName} - ${version} - Exam Paper.docx`);
      const keyBlob = await buildAnswerKeyDocx({ classNumber, coverExamName: versionCoverName, questions: versionQuestions });
      downloadDocxBlob(keyBlob, `${examName} - ${version} - Answer Key.docx`);
    } finally {
      setGenerating(null);
    }
  }
```

Replace the two generate buttons and their surrounding `div` (currently lines 329–354) with:

```jsx
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="primary"
                style={{ width: "auto" }}
                disabled={saving || workingQuestions.length === 0}
                onClick={handleSaveReference}
              >
                {saving ? "Saving…" : "Save Question Set"}
              </button>
              <button
                className="secondary"
                style={{ width: "auto" }}
                disabled={generating !== null || workingQuestions.length === 0 || missingClassNumber || missingExamName}
                onClick={() => handleGenerate("A")}
              >
                {generating === "A" ? "Generating…" : "Generate Version A"}
              </button>
              <button
                className="secondary"
                style={{ width: "auto" }}
                disabled={generating !== null || workingQuestions.length === 0 || missingClassNumber || missingExamName || !bAvailable}
                onClick={() => handleGenerate("B")}
              >
                {generating === "B" ? "Generating…" : "Generate Version B"}
              </button>
            </div>
            {!bAvailable && workingQuestions.length > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                Save Question Set to lock in Version B.
              </p>
            )}
```

(This sits inside the same "Finalize & Export" card, immediately before the existing `{saveMessage && (...)}` block — leave that block and everything after it in the file unchanged.)

- [ ] **Step 4: Delete the scratch script and build clean**

```bash
cd web && rm -f verify-sameidset.mjs && npm run build
```

Expected: clean build, no errors (this also catches any leftover reference to the old `kind === "paper" | "key"` generating values or the removed sort — a stale reference would be a build-time or lint-time signal to check, though most of this is only checkable by actually running the app, which Task 4 covers).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/TestBankBuilder.jsx && git commit -m "$(cat <<'EOF'
feat: replace single-version generate with Version A / Version B buttons

Working Set now displays in insertion order (Version A's order,
no more category/sequence resort). Generate Version A always uses the
live working set; Generate Version B is gated on the working set
exactly matching the last-saved bQuestionIds so it only ever
regenerates the fixed, reproducible shuffle from Task 1 rather than a
new one per click.
EOF
)"
```

---

### Task 4: End-to-end browser verification, then push

**Files:** none — verification only, using the app's existing local sandbox harness (`npm run dev:sandbox` / `npm run sandbox`, per `docs/superpowers/specs/2026-07-28-local-emulator-sandbox-design.md`).

**Interfaces:** none.

- [ ] **Step 1: Build clean one more time from the full set of changes**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 2: Drive the actual Test Bank builder UI in a browser and confirm the full flow**

Use the project's `web:verify` skill (or manually run `npm run dev:sandbox` with seeded data via `npm run seed:sandbox`, then open the app in a browser) to walk through the design spec's testing checklist end to end:
1. Build a working set mixing random draw and manual add/remove — the Working Set panel lists questions in the order added, not grouped by category.
2. Click **Generate Version A** without saving first — succeeds; both files download; cover reads `"{Exam Name}-A"`; the answer key's cover matches the paper's (department name, logo, class line, exam name) except its bottom line reads **Answer Key** instead of Name/Lawson.
3. Before ever saving, confirm **Generate Version B** is disabled with the "Save Question Set to lock in Version B" hint visible.
4. Click **Save Question Set**, then **Generate Version B** — now enabled; both files download; same questions as A but reordered; cover reads `"{Exam Name}-B"`.
5. Click **Generate Version B** again with no changes — same order as the previous download (open both, compare the question sequence).
6. Add or remove one question from the working set without re-saving — **Generate Version B** becomes disabled again.
7. Click **Save Question Set** again — **Generate Version B** re-enabled with a (likely different) shuffle of the updated set.
8. Reload the page with the drive still connected and the exam previously saved — both buttons work immediately without rebuilding the working set.

- [ ] **Step 3: Push the branch**

```bash
git push
```

Expected: pushes all commits from Tasks 1–3 to the remote branch.
