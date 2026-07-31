# Test Bank — .LXRBank Import & Exam Building Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-only "Test Bank" feature that imports GFD's real LXR Test question banks (`.LXRBank` files, parsed entirely client-side) from a physically-secured, marker-authenticated thumbdrive, lets an admin assemble a question set for an existing written exam (random draw by category, manual pick, or both, freely adjustable, with in-app editing written back to the drive), and generates a downloadable exam-paper PDF and a separate answer-key PDF — all without ever writing question text, answers, or notes to Firestore.

**Architecture:** A pure client-side extension of the existing React/Vite SPA — no backend, no Cloud Functions, consistent with how this app already works. Three new library modules under `web/src/lib/` (drive access via the File System Access API, `.LXRBank` parsing via `mdb-reader`, and PDF generation via `jsPDF`) are composed by two new UI pieces (`TestBankPage.jsx`, `TestBankBuilder.jsx` + `TestBankQuestionEditor.jsx`) reached from a new button on the existing "Manage Exams" screen. Firestore only ever stores a safe reference (bank filename + question IDs + points) on the existing exam's `templates/{id}` doc — see `docs/superpowers/specs/2026-07-28-test-bank-lxrbank-import-design.md` for full rationale.

**Tech Stack:** `mdb-reader` (pure-JS Access/Jet database parser, confirmed working against a real sample bank — see Task 3), `buffer` (browser Buffer polyfill `mdb-reader` requires), `jspdf` (client-side PDF generation, confirmed working in both Node and a Vite browser bundle — see Tasks 2–4), the browser's native File System Access API (`showDirectoryPicker`, Chrome/Edge only), and IndexedDB (native, for persisting the granted drive handle across visits). No unit-test framework is installed in `web/` (consistent with every other recent plan in this repo) — verification is a mix of real Node scripts run against an actual sample `.LXRBank` file and manual browser click-through against the local emulator sandbox (`npm run sandbox`).

## Global Constraints

- Nothing parsed from inside a bank — question stem text, answer text, notes, keywords — is ever written to Firestore. The *only* thing Firestore ever holds is `templates/{examId}.testBank = { bankFileName, questionIds, pointsById, importedAt, lastBuiltAt }`.
- The original `.LXRBank` file is never modified and never copied into the git repo. In-app edits are written to a sidecar JSON file (`<bankfile>.overrides.json`) on the same drive/folder, never to Firestore.
- The generated exam-paper and answer-key PDFs are direct browser downloads only — never uploaded to Firebase Storage or anywhere else in the app.
- Only fill-in-the-blank questions (`QB_qtype === "OPN"` and `QB_subtype === "F"`) are treated as supported content; any other question type found in a bank is flagged as unsupported, never guessed at.
- The drive authentication check (`.gfd-testbank-auth` marker file vs. `VITE_TESTBANK_DRIVE_TOKEN`) is a simple shared-secret comparison, not cryptographic — this is a deliberate, accepted tradeoff (see the design doc's Security section), not a gap to fix in this plan.
- This is a prototype developed and verified against the local emulator sandbox (`npm run sandbox`, already implemented on this branch), not the live production Firebase project. No task in this plan touches `npm run dev`'s real `.env` path, `web/firestore.rules` beyond what's already there (no rule changes are needed — `allow write: if isAdminRole();` on `templates/{templateId}` already covers the new `testBank` field), or existing exam grading (`recordExamScore` in `web/src/lib/exams.js` is untouched — grading stays one holistic score).
- The real sample bank used for verification throughout this plan lives at `C:\Users\ffhal\Downloads\Questions.LXRBank` on this machine — real GFD exam content. Every verification step that touches it reads it in place; nothing in this plan ever copies it into the repo or anywhere else.

---

### Task 1: Dependencies and drive-auth token config

**Files:**
- Modify: `web/package.json`
- Modify: `web/.env.example`
- Modify: `web/.env.sandbox`

**Interfaces:**
- Produces: `mdb-reader`, `buffer`, and `jspdf` as installed dependencies (consumed by Tasks 3–4), and `import.meta.env.VITE_TESTBANK_DRIVE_TOKEN` (consumed by Task 2's `authenticateDrive`).

- [ ] **Step 1: Install the new dependencies**

From `web/`:
```bash
npm install mdb-reader buffer jspdf
```
Expected: `package.json`'s `"dependencies"` gains three new entries (versions may differ slightly from below depending on install date):
```json
    "buffer": "^6.0.3",
    "jspdf": "^4.2.1",
    "mdb-reader": "^3.2.0",
```
No install errors.

- [ ] **Step 2: Add the drive-auth token to `web/.env.example`**

Append to the end of `web/.env.example`:
```
# --- Optional: Test Bank drive authentication (admin-only feature) ---
# A shared-secret token the app compares against a marker file (.gfd-testbank-auth) on the
# physically-secured thumbdrive holding .LXRBank question banks. Without this set, the Test
# Bank feature always reports "not authorized" for any drive. See
# docs/superpowers/specs/2026-07-28-test-bank-lxrbank-import-design.md for why this is a
# simple shared-secret check, not cryptographic.
VITE_TESTBANK_DRIVE_TOKEN=
```

- [ ] **Step 3: Add a fixed sandbox token to `web/.env.sandbox`**

Add this line to `web/.env.sandbox` (it already ends with `VITE_USE_EMULATOR=1`):
```
VITE_TESTBANK_DRIVE_TOKEN=sandbox-testbank-token
```
This is a fixed, meaningless placeholder value — safe to commit, same as every other value already in this file. It's the token every later verification step in this plan uses.

- [ ] **Step 4: Verify the app still builds**

From `web/`:
```bash
npm run build
```
Expected: succeeds with no errors (the new dependencies aren't imported by any code yet, so this just confirms `npm install` didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/.env.example web/.env.sandbox
git commit -m "feat: add test bank dependencies and drive-auth token config"
```

---

### Task 2: Drive access & authentication module

**Files:**
- Create: `web/src/lib/testBankDrive.js`

**Interfaces:**
- Produces: `connectDrive()`, `getStoredDriveHandle()`, `authenticateDrive(dirHandle)`, `listBankFiles(dirHandle)`, `readBankFile(dirHandle, fileName)`, `readOverrides(dirHandle, bankFileName)`, `writeOverrides(dirHandle, bankFileName, overrides)`, and the `AUTH_MARKER_FILENAME` constant — all consumed by Task 5 (`TestBankPage.jsx`) and Task 7 (`TestBankBuilder.jsx`).

- [ ] **Step 1: Create `web/src/lib/testBankDrive.js`**

```javascript
// File System Access API wrapper for the physically-secured test bank thumbdrive. Nothing
// here ever sends drive content anywhere — every function operates on a local
// FileSystemDirectoryHandle and either returns data to the caller or writes back to the
// same drive. See docs/superpowers/specs/2026-07-28-test-bank-lxrbank-import-design.md.

const DB_NAME = "gfd-testbank";
const STORE_NAME = "handles";
const HANDLE_KEY = "driveDirectoryHandle";

export const AUTH_MARKER_FILENAME = ".gfd-testbank-auth";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Opens the native folder picker and remembers the chosen folder (in IndexedDB) so future
 * visits don't need to re-prompt — see getStoredDriveHandle. Requests read+write up front
 * since editing a question later writes an overrides file back to the same folder. */
export async function connectDrive() {
  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  await idbSet(HANDLE_KEY, dirHandle);
  return dirHandle;
}

/** Re-uses a previously granted folder handle if the browser still honors it. Returns null
 * if nothing was ever connected, or if the user denies the re-grant prompt. */
export async function getStoredDriveHandle() {
  const dirHandle = await idbGet(HANDLE_KEY);
  if (!dirHandle) return null;
  const granted = await dirHandle.queryPermission({ mode: "readwrite" });
  if (granted === "granted") return dirHandle;
  const requested = await dirHandle.requestPermission({ mode: "readwrite" });
  return requested === "granted" ? dirHandle : null;
}

/** Simple shared-secret check, not cryptographic — see the design doc's Security section
 * for why that tradeoff is acceptable here. Missing file, wrong token, or any read error
 * all mean "not authorized." */
export async function authenticateDrive(dirHandle) {
  try {
    const fileHandle = await dirHandle.getFileHandle(AUTH_MARKER_FILENAME);
    const file = await fileHandle.getFile();
    const token = (await file.text()).trim();
    return token.length > 0 && token === import.meta.env.VITE_TESTBANK_DRIVE_TOKEN;
  } catch {
    return false;
  }
}

export async function listBankFiles(dirHandle) {
  const names = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file" && name.toLowerCase().endsWith(".lxrbank")) {
      names.push(name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export async function readBankFile(dirHandle, fileName) {
  const fileHandle = await dirHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.arrayBuffer();
}

function overridesFileName(bankFileName) {
  return `${bankFileName}.overrides.json`;
}

/** Returns {} (no overrides) if the sidecar file doesn't exist yet — a bank that has never
 * been edited in-app has no overrides file at all. */
export async function readOverrides(dirHandle, bankFileName) {
  try {
    const fileHandle = await dirHandle.getFileHandle(overridesFileName(bankFileName));
    const file = await fileHandle.getFile();
    const text = await file.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/** overrides is the FULL accumulated map (not a delta) — callers merge new edits into the
 * existing object themselves before calling this. */
export async function writeOverrides(dirHandle, bankFileName, overrides) {
  const fileHandle = await dirHandle.getFileHandle(overridesFileName(bankFileName), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(overrides, null, 2));
  await writable.close();
}
```

- [ ] **Step 2: Create the marker file for local testing**

This plan uses `C:\Users\ffhal\Downloads\` (where the real sample bank already sits) as the stand-in "drive" for every verification step. Using `.NET`'s `WriteAllText` avoids PowerShell's default UTF-16/BOM encoding, which would make the browser's `file.text()` read back something that doesn't match the token:

```powershell
[System.IO.File]::WriteAllText("C:\Users\ffhal\Downloads\.gfd-testbank-auth", "sandbox-testbank-token")
```

- [ ] **Step 3: Verify in a real browser via the Vite dev server**

No emulators or seeding needed for this module alone. From `web/`:
```bash
npm run dev:sandbox
```
Open the printed URL in Chrome. Open DevTools → Console, and run:
```javascript
const mod = await import("/src/lib/testBankDrive.js");
const handle = await mod.connectDrive();
```
A native folder-picker dialog opens — pick `C:\Users\ffhal\Downloads`. Expected: the promise resolves with a `FileSystemDirectoryHandle`, no thrown error.

```javascript
await mod.authenticateDrive(handle);
```
Expected: `true` (the marker file from Step 2 matches `VITE_TESTBANK_DRIVE_TOKEN=sandbox-testbank-token` from Task 1).

```javascript
await mod.listBankFiles(handle);
```
Expected: `["Questions.LXRBank"]`.

```javascript
const buf = await mod.readBankFile(handle, "Questions.LXRBank");
buf.byteLength;
```
Expected: a number greater than 0 matching the real file's actual size on disk.

```javascript
await mod.writeOverrides(handle, "Questions.LXRBank", { 1: { answerText: "Test Override" } });
await mod.readOverrides(handle, "Questions.LXRBank");
```
Expected: `{ "1": { "answerText": "Test Override" } }` read back correctly, and a new file `Questions.LXRBank.overrides.json` now exists in the Downloads folder (confirm with `ls "C:\Users\ffhal\Downloads\Questions.LXRBank.overrides.json"` in a terminal).

Delete that test overrides file afterward so later tasks start clean:
```bash
rm "/c/Users/ffhal/Downloads/Questions.LXRBank.overrides.json"
```

Stop the dev server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/testBankDrive.js
git commit -m "feat: add File System Access API drive module for the test bank"
```

---

### Task 3: `.LXRBank` parser module

**Files:**
- Create: `web/src/lib/lxrbankParser.js`

**Interfaces:**
- Produces: `parseLxrBank(buffer)` returning `{ questions: [{ quesId, category, seq, points, qtype, subtype, supported, stemText, answerText, notesText, keywords }] }`, and `applyOverrides(questions, overrides)` — both consumed by Task 5 (`TestBankPage.jsx`) and Task 7 (`TestBankBuilder.jsx`).

- [ ] **Step 1: Create `web/src/lib/lxrbankParser.js`**

```javascript
// Parses a .LXRBank file (a Microsoft Access/Jet database, LXR Test's native question bank
// format) entirely in memory — no upload, no backend. See the design doc's "Import, Parsing
// & Browsing" section for the table layout this depends on (Questions/Text/KeyWords, joined
// by QB_quesId).
import MDBReader from "mdb-reader";
import { Buffer } from "buffer";

const SUPPORTED_QTYPE = "OPN";
const SUPPORTED_SUBTYPE = "F";

// Box numbers are LXR Test's own internal layout slots, confirmed against a real sample
// bank. Other box numbers exist in the schema but are unused for fill-in-the-blank questions.
const BOX_STEM = 1;
const BOX_ANSWER = 4;
const BOX_NOTES = 5;

/** buffer is an ArrayBuffer (from File.arrayBuffer(), browser callers) or a Node Buffer
 * (verification scripts). Returns { questions: [...] }, sorted by category then sequence —
 * the same order LXR Test itself prints a category in. */
export async function parseLxrBank(buffer) {
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const reader = new MDBReader(nodeBuffer);

  const questionRows = reader.getTable("Questions").getData();
  const textRows = reader.getTable("Text").getData();
  const keywordRows = reader.getTable("KeyWords").getData();

  const textByQuesId = new Map();
  for (const row of textRows) {
    if (!textByQuesId.has(row.TXT_quesId)) textByQuesId.set(row.TXT_quesId, new Map());
    textByQuesId.get(row.TXT_quesId).set(row.TXT_boxNumber, row.TXT_text ?? "");
  }

  const keywordsByQuesId = new Map();
  for (const row of keywordRows) {
    if (!keywordsByQuesId.has(row.KW_quesId)) keywordsByQuesId.set(row.KW_quesId, []);
    if (row.KW_data != null) keywordsByQuesId.get(row.KW_quesId).push(row.KW_data);
  }

  const questions = questionRows.map((row) => {
    const boxes = textByQuesId.get(row.QB_quesId) ?? new Map();
    return {
      quesId: row.QB_quesId,
      category: row.QB_obj ?? "",
      seq: row.QB_seq ?? 0,
      points: row.QB_points ?? 0,
      qtype: row.QB_qtype ?? "",
      subtype: row.QB_subtype ?? "",
      supported: row.QB_qtype === SUPPORTED_QTYPE && row.QB_subtype === SUPPORTED_SUBTYPE,
      stemText: (boxes.get(BOX_STEM) ?? "").trim(),
      answerText: (boxes.get(BOX_ANSWER) ?? "").replace(/^\s*Answer:\s*/i, "").trim(),
      notesText: (boxes.get(BOX_NOTES) ?? "").trim(),
      keywords: keywordsByQuesId.get(row.QB_quesId) ?? [],
    };
  });

  questions.sort((a, b) => a.category.localeCompare(b.category) || a.seq - b.seq);

  return { questions };
}

/** overrides is a { [quesId]: { stemText?, answerText?, points? } } map, as written by
 * testBankDrive.writeOverrides. Never mutates the input array. */
export function applyOverrides(questions, overrides) {
  return questions.map((q) => {
    const override = overrides[q.quesId];
    return override ? { ...q, ...override } : q;
  });
}
```

- [ ] **Step 2: Verify against the real sample bank with a throwaway Node script**

Create `web/scripts/tmp-verify-parser.mjs` (throwaway — deleted in Step 4, never committed):
```javascript
import { readFileSync } from "fs";
import { parseLxrBank, applyOverrides } from "../src/lib/lxrbankParser.js";

const buffer = readFileSync("C:\\Users\\ffhal\\Downloads\\Questions.LXRBank");
const { questions } = await parseLxrBank(buffer);

console.log("Question count:", questions.length);
console.log("Unsupported count:", questions.filter((q) => !q.supported).length);
console.log("Categories:", [...new Set(questions.map((q) => q.category))].sort());

const q1 = questions.find((q) => q.quesId === 1);
console.log("Question 1 stem:", q1.stemText);
console.log("Question 1 answer:", q1.answerText);
console.log("Question 1 keywords:", q1.keywords);

const overridden = applyOverrides(questions, { 1: { answerText: "Overridden Answer" } });
console.log("Override applied:", overridden.find((q) => q.quesId === 1).answerText);
console.log("Original untouched:", questions.find((q) => q.quesId === 1).answerText);
```

From `web/`:
```bash
node scripts/tmp-verify-parser.mjs
```
Expected output shape (exact counts/text/categories depend entirely on
whatever real `.LXRBank` file is pointed at — this was validated during
design against a real sample bank and produced a fully-populated,
non-empty result matching this shape for every field):
```
Question count: <matches the source file's real question count>
Unsupported count: <0 if the bank is entirely fill-in-the-blank>
Categories: [ <one entry per distinct QB_obj value in the source file> ]
Question 1 stem: <the real stem text, with a run of spaces where the blank goes>
Question 1 answer: <the real answer text, "Answer: " prefix stripped>
Question 1 keywords: [ <the real keyword/reference codes for that question> ]
Override applied: Overridden Answer
Original untouched: <question 1's real, unmodified answer text>
```

- [ ] **Step 3: Verify the module also bundles for the browser**

From `web/`:
```bash
npm run build
```
Expected: succeeds (confirms `mdb-reader` + `buffer` resolve correctly under this repo's actual Vite 5 setup, not just the standalone check done while designing this plan). Warnings about `stream`/`events` being externalized for browser compatibility are expected and harmless — they come from `mdb-reader`'s unused password-decryption code path (unencrypted banks, like the one used to validate this design, never exercise it).

- [ ] **Step 4: Delete the throwaway script**

```bash
rm scripts/tmp-verify-parser.mjs
```

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/lxrbankParser.js
git commit -m "feat: add .LXRBank parser module"
```

---

### Task 4: PDF generation module

**Files:**
- Create: `web/src/lib/examPdf.js`

**Interfaces:**
- Consumes: question objects shaped like Task 3's `parseLxrBank` output (`{ points, stemText, answerText }` at minimum).
- Produces: `buildExamPaperPdf({ examName, questions })`, `buildAnswerKeyPdf({ examName, questions })` (both return a `Blob`), and `downloadPdfBlob(blob, filename)` — all consumed by Task 7 (`TestBankBuilder.jsx`).

- [ ] **Step 1: Create `web/src/lib/examPdf.js`**

```javascript
// Builds the two printable PDFs from an assembled question set, entirely client-side.
// Neither is ever uploaded anywhere — downloadPdfBlob triggers a direct browser download.
import { jsPDF } from "jspdf";

const MARGIN = 15;
const LINE_HEIGHT = 7;
const PAGE_HEIGHT = 297; // A4 mm
const USABLE_WIDTH = 210 - MARGIN * 2;

function addWrappedText(doc, text, x, y, maxWidth) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * LINE_HEIGHT;
}

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE_HEIGHT - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function newDocWithHeader(examName, title) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(examName, MARGIN, MARGIN);
  doc.setFontSize(11);
  doc.text(title, MARGIN, MARGIN + 8);
  return { doc, y: MARGIN + 18 };
}

export function buildExamPaperPdf({ examName, questions }) {
  const { doc, y: startY } = newDocWithHeader(examName, "Exam Paper");
  let y = startY;
  questions.forEach((q, index) => {
    y = ensureSpace(doc, y, 20);
    y = addWrappedText(doc, `${index + 1}. (${q.points} pt) ${q.stemText}`, MARGIN, y, USABLE_WIDTH);
    y += LINE_HEIGHT;
  });
  return doc.output("blob");
}

export function buildAnswerKeyPdf({ examName, questions }) {
  const { doc, y: startY } = newDocWithHeader(examName, "Answer Key");
  let y = startY;
  questions.forEach((q, index) => {
    y = ensureSpace(doc, y, 14);
    y = addWrappedText(doc, `${index + 1}. ${q.answerText}`, MARGIN, y, USABLE_WIDTH);
  });
  return doc.output("blob");
}

export function downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify with a throwaway Node script**

Create `web/scripts/tmp-verify-pdf.mjs` (throwaway — deleted in Step 3, never committed):
```javascript
import { writeFileSync } from "fs";
import { buildAnswerKeyPdf, buildExamPaperPdf } from "../src/lib/examPdf.js";

const questions = [
  {
    quesId: 1,
    category: "Sample Category A",
    points: 1,
    stemText: "The tool used to tighten a bolt is called a ___.",
    answerText: "Wrench",
  },
  {
    quesId: 2,
    category: "Sample Category A",
    points: 1,
    stemText: "Name two common types of fasteners.",
    answerText: "bolts and screws",
  },
];

const paperBlob = buildExamPaperPdf({ examName: "Sample Exam", questions });
const keyBlob = buildAnswerKeyPdf({ examName: "Sample Exam", questions });

writeFileSync("tmp-exam-paper.pdf", Buffer.from(await paperBlob.arrayBuffer()));
writeFileSync("tmp-answer-key.pdf", Buffer.from(await keyBlob.arrayBuffer()));

console.log("Exam paper bytes:", paperBlob.size, "header:", await paperBlob.slice(0, 5).text());
console.log("Answer key bytes:", keyBlob.size, "header:", await keyBlob.slice(0, 5).text());
```

From `web/`:
```bash
node scripts/tmp-verify-pdf.mjs
```
Expected output (exact byte counts may vary slightly by jsPDF version, both should be in the low thousands):
```
Exam paper bytes: 3300ish header: %PDF-
Answer key bytes: 3100ish header: %PDF-
```

Open both generated files to visually confirm content:
```bash
start web/tmp-exam-paper.pdf
start web/tmp-answer-key.pdf
```
Expected: the exam paper shows "Sample Exam" / "Exam Paper" header, then "1. (1 pt) The tool used to tighten a bolt..." and "2. (1 pt) Name two common types...". The answer key shows the same header pattern with "Exam Answer Key", then "1. Wrench" and "2. bolts and screws".

- [ ] **Step 3: Delete the throwaway script and generated PDFs**

```bash
rm scripts/tmp-verify-pdf.mjs tmp-exam-paper.pdf tmp-answer-key.pdf
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/examPdf.js
git commit -m "feat: add exam paper and answer key PDF generation module"
```

---

### Task 5: Test Bank page shell — drive connect, bank selection, route, entry button

**Files:**
- Create: `web/src/pages/TestBankPage.jsx`
- Modify: `web/src/App.jsx`
- Modify: `web/src/pages/ExamsAdminPage.jsx`

**Interfaces:**
- Consumes: Task 2's `testBankDrive.js` (`connectDrive`, `getStoredDriveHandle`, `authenticateDrive`, `listBankFiles`, `readBankFile`, `readOverrides`) and Task 3's `lxrbankParser.js` (`parseLxrBank`, `applyOverrides`).
- Produces: the `/exams/:examId/test-bank` route, and a `bankData` shape (`{ fileName, baseQuestions, overrides }`) that Task 7 will consume when it replaces this task's placeholder summary with the real `<TestBankBuilder>`.

- [ ] **Step 1: Create `web/src/pages/TestBankPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import {
  authenticateDrive,
  connectDrive,
  getStoredDriveHandle,
  listBankFiles,
  readBankFile,
  readOverrides,
} from "../lib/testBankDrive";
import { applyOverrides, parseLxrBank } from "../lib/lxrbankParser";

export default function TestBankPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [dirHandle, setDirHandle] = useState(null);
  const [driveStatus, setDriveStatus] = useState("checking"); // checking | disconnected | unauthorized | authorized
  const [bankFiles, setBankFiles] = useState([]);
  const [bankData, setBankData] = useState(null); // { fileName, baseQuestions, overrides }
  const [loadingBank, setLoadingBank] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "templates", examId)).then((snap) => {
      setExam(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [examId]);

  useEffect(() => {
    (async () => {
      const handle = await getStoredDriveHandle();
      if (!handle) {
        setDriveStatus("disconnected");
        return;
      }
      await authorizeAndList(handle);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function authorizeAndList(handle) {
    setDirHandle(handle);
    const ok = await authenticateDrive(handle);
    if (!ok) {
      setDriveStatus("unauthorized");
      return;
    }
    setDriveStatus("authorized");
    setBankFiles(await listBankFiles(handle));
  }

  async function handleConnect() {
    setError(null);
    try {
      const handle = await connectDrive();
      await authorizeAndList(handle);
    } catch (err) {
      if (err?.name !== "AbortError") setError("Could not access the drive: " + err.message);
    }
  }

  async function handleSelectBank(fileName) {
    setLoadingBank(true);
    setError(null);
    try {
      const buffer = await readBankFile(dirHandle, fileName);
      const overrides = await readOverrides(dirHandle, fileName);
      const { questions } = await parseLxrBank(buffer);
      setBankData({ fileName, baseQuestions: questions, overrides });
    } catch (err) {
      setError("Could not read that bank file: " + err.message);
    } finally {
      setLoadingBank(false);
    }
  }

  const questions = useMemo(
    () => (bankData ? applyOverrides(bankData.baseQuestions, bankData.overrides) : []),
    [bankData]
  );

  return (
    <div className="app-shell">
      <TopBar title="Test Bank" subtitle={exam?.name} onBack={() => navigate("/exams")} showMenu={false} />
      <div className="screen">
        {error && (
          <p className="muted" style={{ color: "var(--brand-red)" }}>
            {error}
          </p>
        )}

        {driveStatus === "checking" && <p className="muted">Checking for a connected drive…</p>}

        {driveStatus === "disconnected" && (
          <div className="card">
            <p className="muted">
              Connect the authorized test bank drive to browse and build exams from its
              question banks.
            </p>
            <button className="primary" onClick={handleConnect}>
              Connect Drive
            </button>
          </div>
        )}

        {driveStatus === "unauthorized" && (
          <div className="card">
            <p className="muted" style={{ color: "var(--brand-red)" }}>
              This drive is not authorized for the test bank.
            </p>
            <button className="secondary" onClick={handleConnect}>
              Try a Different Drive
            </button>
          </div>
        )}

        {driveStatus === "authorized" && !bankData && (
          <div className="card">
            <p className="muted">
              {bankFiles.length === 0
                ? "No .LXRBank files found on this drive."
                : "Select a bank to browse or build from:"}
            </p>
            {bankFiles.map((fileName) => (
              <button
                key={fileName}
                className="list-row"
                style={{ width: "100%", textAlign: "left" }}
                disabled={loadingBank}
                onClick={() => handleSelectBank(fileName)}
              >
                {fileName}
              </button>
            ))}
          </div>
        )}

        {bankData && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{bankData.fileName}</h3>
            <p className="muted">
              {questions.length} questions across{" "}
              {[...new Set(questions.map((q) => q.category))].length} categories.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route in `web/src/App.jsx`**

Add this import alongside the other page imports (right after the `ExamsAdminPage` import):
```javascript
import ExamsAdminPage from "./pages/ExamsAdminPage";
import TestBankPage from "./pages/TestBankPage";
```

Add this route right after the existing `/exams` route:
```jsx
      <Route path="/exams" element={<RequireAuth><RequireAdminRole><ExamsAdminPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/exams/:examId/test-bank" element={<RequireAuth><RequireAdminRole><TestBankPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Add the entry button in `web/src/pages/ExamsAdminPage.jsx`**

Find this block (the exam card's summary-transcript checkbox):
```jsx
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={!!exam.includeInSummaryTranscript}
                onChange={() => toggleSummary(exam)}
                style={{ width: "auto", margin: 0 }}
              />
              Include on Summary Transcript
            </label>
          </div>
        ))}
```

Replace it with:
```jsx
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={!!exam.includeInSummaryTranscript}
                onChange={() => toggleSummary(exam)}
                style={{ width: "auto", margin: 0 }}
              />
              Include on Summary Transcript
            </label>
            <button
              className="secondary"
              style={{ marginTop: 8 }}
              onClick={() => navigate(`/exams/${exam.id}/test-bank`)}
            >
              Build from Test Bank
            </button>
          </div>
        ))}
```

- [ ] **Step 4: Verify end-to-end via the sandbox**

From `web/`:
```bash
npm run sandbox
```
Wait for the printed `Local:` URL and the `Sandbox seeded.` admin login. Open the URL, sign in with `sandbox@example.com` / `sandbox123`.

Navigate to Manage Exams (menu → Manage Exams) and create a new exam: name "Sandbox Written Exam", category "Written Exam". Expected: it appears in the exam list.

Click the new "Build from Test Bank" button on that exam's card. Expected: navigates to `/exams/<id>/test-bank`, page title "Test Bank", subtitle "Sandbox Written Exam".

If a drive was connected in Task 2's verification and the browser session/profile is the same, it may auto-reconnect (`driveStatus` goes straight to `authorized`). Otherwise, click "Connect Drive", pick `C:\Users\ffhal\Downloads` again (the marker file from Task 2 Step 2 is still there). Expected: status becomes "authorized", `Questions.LXRBank` is listed.

Click `Questions.LXRBank`. Expected: a card appears reading "<N> questions across <M> categories" where N/M match the real source file's actual question count and number of distinct categories.

Stop the sandbox (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/TestBankPage.jsx web/src/App.jsx web/src/pages/ExamsAdminPage.jsx
git commit -m "feat: add Test Bank page shell with drive connect and bank selection"
```

---

### Task 6: Firestore reference helpers + question editor modal

**Files:**
- Create: `web/src/lib/testBankExam.js`
- Create: `web/src/components/TestBankQuestionEditor.jsx`

**Interfaces:**
- Consumes: `web/src/firebase.js`'s `db` export; `web/src/components/Modal.jsx`; Task 2's `writeOverrides` (called by Task 7, not here — this task's editor only calls the `onSave` callback it's given).
- Produces: `saveTestBankReference(examId, { bankFileName, questionIds, pointsById })`, `loadTestBankReference(examId)`, and the `<TestBankQuestionEditor question onSave onClose />` component — both consumed by Task 7 (`TestBankBuilder.jsx`).

- [ ] **Step 1: Create `web/src/lib/testBankExam.js`**

```javascript
// Reads/writes the safe, non-sensitive test-bank reference on an exam's template doc. Never
// touches question text/answers — see the design doc's Security section for what "safe"
// means here.
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

export async function saveTestBankReference(examId, { bankFileName, questionIds, pointsById }) {
  const ref = doc(db, "templates", examId);
  const existing = (await getDoc(ref)).data()?.testBank;
  const now = Timestamp.now();
  const testBank = {
    bankFileName,
    questionIds,
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

- [ ] **Step 2: Create `web/src/components/TestBankQuestionEditor.jsx`**

```jsx
import { useState } from "react";
import Modal from "./Modal";

/** onSave(quesId, { stemText, answerText, points }) is awaited before the modal closes —
 * the caller (TestBankBuilder) is responsible for actually persisting the override. */
export default function TestBankQuestionEditor({ question, onSave, onClose }) {
  const [stemText, setStemText] = useState(question.stemText);
  const [answerText, setAnswerText] = useState(question.answerText);
  const [points, setPoints] = useState(question.points);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(question.quesId, { stemText, answerText, points: Number(points) });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal titleId="edit-question-title" onClose={onClose}>
      <h3 id="edit-question-title" style={{ marginTop: 0 }}>
        Edit Question
      </h3>
      <div className="field">
        <label>Question Text</label>
        <textarea rows={4} value={stemText} onChange={(e) => setStemText(e.target.value)} />
      </div>
      <div className="field">
        <label>Answer</label>
        <input type="text" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
      </div>
      <div className="field">
        <label>Points</label>
        <input type="number" min="0" value={points} onChange={(e) => setPoints(e.target.value)} />
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Saved to the drive alongside this bank — the original .LXRBank file is never modified.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Verify `testBankExam.js` against the sandbox emulator**

`TestBankQuestionEditor.jsx`'s own visual check happens once it's wired into the builder in Task 7 — this step verifies the security-critical piece: that Firestore only ever receives the safe reference shape.

From `web/`:
```bash
npm run sandbox
```
Sign in as `sandbox@example.com` / `sandbox123`, create an exam via Manage Exams if you didn't keep the one from Task 5 (name "Sandbox Written Exam"), and copy its id from the URL after clicking "Build from Test Bank" (e.g. `/exams/AbC123xyz/test-bank` → id is `AbC123xyz`).

In the browser DevTools console on that page:
```javascript
const mod = await import("/src/lib/testBankExam.js");
await mod.saveTestBankReference("AbC123xyz", {
  bankFileName: "Questions.LXRBank",
  questionIds: [1, 2, 3],
  pointsById: { 1: 1, 2: 1, 3: 1 },
});
await mod.loadTestBankReference("AbC123xyz");
```
Expected: the loaded reference matches what was saved, with `importedAt`/`lastBuiltAt` timestamps added.

In a separate terminal, confirm via the emulator's REST API (same pattern as `web/.claude/skills/verify/SKILL.md`) that only the safe fields exist — replace `AbC123xyz` with your real id:
```bash
curl -s "http://127.0.0.1:8080/v1/projects/demo-gfd-sandbox/databases/(default)/documents/templates/AbC123xyz" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const f=JSON.parse(d).fields.testBank.mapValue.fields;console.log(Object.keys(f));})"
```
Expected output:
```
[ 'bankFileName', 'questionIds', 'pointsById', 'importedAt', 'lastBuiltAt' ]
```
No `stemText`, `answerText`, or any other question-content field present.

Stop the sandbox (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/testBankExam.js web/src/components/TestBankQuestionEditor.jsx
git commit -m "feat: add test bank Firestore reference helpers and question editor modal"
```

---

### Task 7: Exam builder — random draw, manual pick, working set, save, generate PDFs

**Files:**
- Create: `web/src/components/TestBankBuilder.jsx`
- Modify: `web/src/pages/TestBankPage.jsx`

**Interfaces:**
- Consumes: Task 2's `writeOverrides`; Task 4's `buildExamPaperPdf`, `buildAnswerKeyPdf`, `downloadPdfBlob`; Task 6's `saveTestBankReference`, `<TestBankQuestionEditor>`; Task 5's `bankData`/`questions` shape and `dirHandle`.
- Produces: the fully working "Build from Test Bank" flow — nothing further consumes this component.

- [ ] **Step 1: Create `web/src/components/TestBankBuilder.jsx`**

```jsx
import { useMemo, useState } from "react";
import { writeOverrides } from "../lib/testBankDrive";
import { saveTestBankReference } from "../lib/testBankExam";
import { buildAnswerKeyPdf, buildExamPaperPdf, downloadPdfBlob } from "../lib/examPdf";
import TestBankQuestionEditor from "./TestBankQuestionEditor";

function pickRandom(list, count) {
  const pool = [...list];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

export default function TestBankBuilder({
  examId,
  examName,
  dirHandle,
  bankFileName,
  questions,
  overrides,
  savedReference,
  onOverridesSaved,
  onSaved,
}) {
  const [workingIds, setWorkingIds] = useState(savedReference?.questionIds ?? []);
  const [drawCategory, setDrawCategory] = useState("");
  const [drawCount, setDrawCount] = useState(5);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [editingQuesId, setEditingQuesId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [generating, setGenerating] = useState(null); // "paper" | "key" | null

  const questionsById = useMemo(() => new Map(questions.map((q) => [q.quesId, q])), [questions]);
  const categories = useMemo(
    () => [...new Set(questions.map((q) => q.category))].sort((a, b) => a.localeCompare(b)),
    [questions]
  );
  const workingQuestions = useMemo(
    () =>
      workingIds
        .map((id) => questionsById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.category.localeCompare(b.category) || a.seq - b.seq),
    [workingIds, questionsById]
  );
  const browseList = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions
      .filter((q) => q.supported)
      .filter((q) => {
        if (filterCategory && q.category !== filterCategory) return false;
        if (!term) return true;
        return q.stemText.toLowerCase().includes(term) || q.answerText.toLowerCase().includes(term);
      });
  }, [questions, filterCategory, search]);

  function toggleWorking(quesId) {
    setWorkingIds((prev) => (prev.includes(quesId) ? prev.filter((id) => id !== quesId) : [...prev, quesId]));
  }

  function handleDraw() {
    if (!drawCategory) return;
    const candidates = questions.filter((q) => q.category === drawCategory && q.supported && !workingIds.includes(q.quesId));
    const picked = pickRandom(candidates, Number(drawCount));
    setWorkingIds((prev) => [...prev, ...picked.map((q) => q.quesId)]);
  }

  async function handleSaveReference() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const pointsById = Object.fromEntries(workingQuestions.map((q) => [q.quesId, q.points]));
      const saved = await saveTestBankReference(examId, { bankFileName, questionIds: workingIds, pointsById });
      onSaved(saved);
      setSaveMessage("Saved.");
    } catch (err) {
      setSaveMessage("Could not save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate(kind) {
    setGenerating(kind);
    try {
      const blob =
        kind === "paper"
          ? buildExamPaperPdf({ examName, questions: workingQuestions })
          : buildAnswerKeyPdf({ examName, questions: workingQuestions });
      const suffix = kind === "paper" ? "Exam Paper" : "Answer Key";
      downloadPdfBlob(blob, `${examName} - ${suffix}.pdf`);
    } finally {
      setGenerating(null);
    }
  }

  async function handleEditSave(quesId, fields) {
    const newOverrides = { ...overrides, [quesId]: { ...overrides[quesId], ...fields } };
    await writeOverrides(dirHandle, bankFileName, newOverrides);
    onOverridesSaved(newOverrides);
  }

  const editingQuestion = editingQuesId != null ? questionsById.get(editingQuesId) : null;
  const unsupportedCount = questions.filter((q) => !q.supported).length;

  return (
    <div>
      {unsupportedCount > 0 && (
        <p className="muted">
          {unsupportedCount} question{unsupportedCount === 1 ? "" : "s"} in this bank use an
          unsupported question type and are excluded below.
        </p>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Random Draw</h3>
        <div className="field">
          <label>Category</label>
          <select value={drawCategory} onChange={(e) => setDrawCategory(e.target.value)}>
            <option value="">Choose a category…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>How many</label>
          <input type="number" min="1" value={drawCount} onChange={(e) => setDrawCount(e.target.value)} />
        </div>
        <button className="secondary" disabled={!drawCategory} onClick={handleDraw}>
          Draw Questions
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Browse &amp; Add Manually</h3>
        <div className="field">
          <input
            type="text"
            placeholder="Search question or answer text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {browseList.map((q) => (
          <div key={q.quesId} className="list-row">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={workingIds.includes(q.quesId)}
                onChange={() => toggleWorking(q.quesId)}
                style={{ width: "auto", marginTop: 4 }}
              />
              <span>
                <span className="muted">
                  {q.category} · {q.points} pt
                </span>
                <br />
                {q.stemText}
              </span>
            </label>
            <button
              className="secondary"
              style={{ width: "auto", padding: "4px 10px" }}
              onClick={() => setEditingQuesId(q.quesId)}
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          Working Set ({workingQuestions.length} question{workingQuestions.length === 1 ? "" : "s"})
        </h3>
        {workingQuestions.length === 0 && <p className="muted">No questions selected yet.</p>}
        {workingQuestions.map((q, index) => (
          <div key={q.quesId} className="list-row">
            <span style={{ flex: 1 }}>
              {index + 1}. <span className="muted">{q.category}</span> — {q.stemText}
            </span>
            <button
              className="secondary"
              style={{ width: "auto", padding: "4px 10px", color: "var(--brand-red)" }}
              onClick={() => toggleWorking(q.quesId)}
            >
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="primary" disabled={saving || workingQuestions.length === 0} onClick={handleSaveReference}>
            {saving ? "Saving…" : "Save Question Set"}
          </button>
          <button
            className="secondary"
            disabled={generating !== null || workingQuestions.length === 0}
            onClick={() => handleGenerate("paper")}
          >
            {generating === "paper" ? "Generating…" : "Generate Exam Paper PDF"}
          </button>
          <button
            className="secondary"
            disabled={generating !== null || workingQuestions.length === 0}
            onClick={() => handleGenerate("key")}
          >
            {generating === "key" ? "Generating…" : "Generate Answer Key PDF"}
          </button>
        </div>
        {saveMessage && <p className="muted" style={{ marginTop: 8 }}>{saveMessage}</p>}
      </div>

      {editingQuestion && (
        <TestBankQuestionEditor question={editingQuestion} onSave={handleEditSave} onClose={() => setEditingQuesId(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `web/src/pages/TestBankPage.jsx`**

Add the import at the top, alongside the other lib imports:
```javascript
import { loadTestBankReference } from "../lib/testBankExam";
import TestBankBuilder from "../components/TestBankBuilder";
```

Add a `savedReference` state and load it alongside the exam doc — replace:
```javascript
  useEffect(() => {
    getDoc(doc(db, "templates", examId)).then((snap) => {
      setExam(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [examId]);
```
with:
```javascript
  const [savedReference, setSavedReference] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "templates", examId)).then((snap) => {
      setExam(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    loadTestBankReference(examId).then(setSavedReference);
  }, [examId]);
```

Replace the placeholder summary card:
```jsx
        {bankData && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{bankData.fileName}</h3>
            <p className="muted">
              {questions.length} questions across{" "}
              {[...new Set(questions.map((q) => q.category))].length} categories.
            </p>
          </div>
        )}
```
with:
```jsx
        {bankData && (
          <TestBankBuilder
            examId={examId}
            examName={exam?.name ?? ""}
            dirHandle={dirHandle}
            bankFileName={bankData.fileName}
            questions={questions}
            overrides={bankData.overrides}
            savedReference={savedReference?.bankFileName === bankData.fileName ? savedReference : null}
            onOverridesSaved={(newOverrides) => setBankData((prev) => ({ ...prev, overrides: newOverrides }))}
            onSaved={setSavedReference}
          />
        )}
```

Also add a mismatch warning to the bank-file picker card, for when this exam was previously built from a bank that isn't on the currently-connected drive — replace:
```jsx
        {driveStatus === "authorized" && !bankData && (
          <div className="card">
            <p className="muted">
              {bankFiles.length === 0
                ? "No .LXRBank files found on this drive."
                : "Select a bank to browse or build from:"}
            </p>
            {bankFiles.map((fileName) => (
              <button
                key={fileName}
                className="list-row"
                style={{ width: "100%", textAlign: "left" }}
                disabled={loadingBank}
                onClick={() => handleSelectBank(fileName)}
              >
                {fileName}
              </button>
            ))}
          </div>
        )}
```
with:
```jsx
        {driveStatus === "authorized" && !bankData && (
          <div className="card">
            {savedReference && !bankFiles.includes(savedReference.bankFileName) && (
              <p className="muted" style={{ color: "var(--brand-red)" }}>
                This exam was previously built from "{savedReference.bankFileName}", which
                isn't on this drive. Connect the drive that has it to regenerate, or pick a
                different bank below to start over.
              </p>
            )}
            <p className="muted">
              {bankFiles.length === 0
                ? "No .LXRBank files found on this drive."
                : "Select a bank to browse or build from:"}
            </p>
            {bankFiles.map((fileName) => (
              <button
                key={fileName}
                className="list-row"
                style={{ width: "100%", textAlign: "left" }}
                disabled={loadingBank}
                onClick={() => handleSelectBank(fileName)}
              >
                {fileName}
                {savedReference?.bankFileName === fileName && (
                  <span className="badge neutral" style={{ marginLeft: 8 }}>
                    Previously used
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
```

- [ ] **Step 3: Verify the full build/edit/save/generate flow via the sandbox**

From `web/`:
```bash
npm run sandbox
```
Sign in, navigate to the same exam's Test Bank page from Task 5/6, connect the drive if needed, select `Questions.LXRBank`. Expected: the "Random Draw", "Browse & Add Manually", and "Working Set" cards render (all of the source file's questions available, no unsupported-type warning if the bank is entirely fill-in-the-blank).

**Random draw:** choose any one real category from the source file, count `3`, click "Draw Questions". Expected: Working Set shows 3 questions, all from that category.

**Manual add:** in Browse & Add Manually, filter by a different real category, check one question's checkbox. Expected: Working Set now shows 4 questions.

**Remove:** click "Remove" on one Working Set entry. Expected: Working Set drops to 3, its checkbox in the browse list (if still visible under the current filter) unchecks.

**Edit:** click "Edit" on any browsed question, change its Answer field to `"Edited Answer"`, click Save. Expected: modal closes; re-run in DevTools console `await (await import("/src/lib/testBankDrive.js")).readOverrides(<the dirHandle you're using>, "Questions.LXRBank")` — actually simpler: just re-select the bank via a page refresh and confirm that question's answer now reads "Edited Answer" in the Browse list. Also confirm on disk: `cat "/c/Users/ffhal/Downloads/Questions.LXRBank.overrides.json"` shows the edited fields.

**Save Question Set:** click "Save Question Set". Expected: "Saved." message appears.

**Generate PDFs:** click "Generate Exam Paper PDF" — expected: browser downloads `Sandbox Written Exam - Exam Paper.pdf`. Click "Generate Answer Key PDF" — expected: downloads `Sandbox Written Exam - Answer Key.pdf`. Open both and confirm the questions/answers match the Working Set, including the edited answer from the previous step.

**Reload persistence:** refresh the page, reconnect the drive if prompted, select `Questions.LXRBank` again. Expected: Working Set pre-populates with the same 3 saved questions (from `savedReference.questionIds`), without needing to redraw/re-pick.

**Mismatch warning:** rename `C:\Users\ffhal\Downloads\Questions.LXRBank` to `C:\Users\ffhal\Downloads\Renamed.LXRBank` (Explorer or `mv`), refresh the Test Bank page, reconnect the drive. Expected: the bank-file list shows `Renamed.LXRBank` (no "Previously used" badge on it) with a red message above it reading `This exam was previously built from "Questions.LXRBank", which isn't on this drive...`. Rename the file back to `Questions.LXRBank` afterward and refresh again — expected: the warning disappears and the "Previously used" badge appears on it instead.

Stop the sandbox (Ctrl+C). Delete the test overrides file so later verification starts clean:
```bash
rm "/c/Users/ffhal/Downloads/Questions.LXRBank.overrides.json"
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/TestBankBuilder.jsx web/src/pages/TestBankPage.jsx
git commit -m "feat: add test bank exam builder with random draw, manual pick, editing, and PDF generation"
```

---

### Task 8: End-to-end verification — security guarantees and error handling

**Files:** none (verification only, exercising everything built in Tasks 1–7 together).

This task specifically re-verifies the design's core security promises hold end-to-end, plus the error-handling paths that don't naturally come up while building the happy path.

- [ ] **Step 1: Confirm an unauthorized drive is rejected**

From `web/`:
```bash
npm run sandbox
```
Sign in, navigate to a Test Bank page (reuse the exam from earlier tasks), click "Connect Drive" (or "Try a Different Drive" if already connected), and this time pick a folder that has **no** `.gfd-testbank-auth` file — e.g. `C:\Users\ffhal\Desktop` (or any folder without the marker). Expected: status shows "This drive is not authorized for the test bank." — no bank files listed, no content read.

Click "Try a Different Drive" again, this time pick `C:\Users\ffhal\Downloads` (the marker file is still there from earlier tasks — recreate it if you deleted it):
```powershell
[System.IO.File]::WriteAllText("C:\Users\ffhal\Downloads\.gfd-testbank-auth", "sandbox-testbank-token")
```
Expected: status becomes "authorized" again, `Questions.LXRBank` listed.

- [ ] **Step 2: Confirm nothing sensitive ever reaches Firestore**

Build a small exam (2–3 questions, any category), click "Save Question Set". Then, in a terminal, dump the *entire* raw document via the emulator REST API — not just the `testBank` field this time, the whole doc — to confirm no other field accidentally picked up question content:
```bash
curl -s "http://127.0.0.1:8080/v1/projects/demo-gfd-sandbox/databases/(default)/documents/templates/<your-exam-id>" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(d))"
```
Expected: scanning the full JSON output, the only test-bank-related content is under `fields.testBank` (`bankFileName`, `questionIds`, `pointsById`, `importedAt`, `lastBuiltAt`) — no `stemText`, `answerText`, `notesText`, `keywords`, or any recognizable question wording anywhere in the document.

- [ ] **Step 3: Confirm PDFs are never uploaded anywhere**

While generating a PDF in Step 2's session, open DevTools → Network tab, filter for anything other than `firestore.googleapis.com`/`identitytoolkit` calls (the emulator equivalents), and click "Generate Exam Paper PDF" again. Expected: no new network request fires at all for the PDF generation/download — it's a pure client-side `Blob` + `<a download>`, confirmed by the absence of any upload request.

- [ ] **Step 4: Confirm a disconnected/missing drive blocks regeneration cleanly**

Refresh the Test Bank page for the exam you just built (so `dirHandle` resets to nothing in memory), and in a fresh **private/incognito** Chrome window (no stored IndexedDB handle) navigate to the same `/exams/<id>/test-bank` URL after signing in. Expected: `driveStatus` starts at "disconnected" — the saved reference from Firestore isn't shown yet because no bank is loaded (this is expected per the design: the saved reference alone can't render questions without the drive). This confirms the security property directly: without the authorized drive, the actual question content is genuinely unobtainable through the app, even though Firestore remembers which questions were used.

- [ ] **Step 5: Full production-safety spot-check**

Confirm this entire plan's changes are additive-only and the real production app is untouched:
```bash
npm run dev
```
Expected: starts against the real `.env`/production Firebase project exactly as before this plan — no test-bank code path is reachable without deliberately navigating to `/exams/:examId/test-bank`, and no existing exam (`recordExamScore`, `ExamsAdminPage`'s Deactivate/summary-toggle, the gradebook) behaves any differently than before. Stop it (Ctrl+C).

- [ ] **Step 6: Clean up test artifacts**

```bash
rm "/c/Users/ffhal/Downloads/.gfd-testbank-auth" "/c/Users/ffhal/Downloads/Questions.LXRBank.overrides.json" 2>/dev/null
```
(The real `Questions.LXRBank` file itself is left untouched — it was never modified by anything in this plan.)

- [ ] **Step 7: No commit**

This task is verification only — nothing to stage. If Step 6 leaves the working tree clean (`git status` shows no changes), the feature is done.
