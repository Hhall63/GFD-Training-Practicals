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
