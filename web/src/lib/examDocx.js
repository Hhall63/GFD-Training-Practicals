// Builds the two printable exam documents as real .docx files, entirely client-side.
// The exam paper's cover page replicates the department's existing exam-paper letterhead
// exactly — dimensions (table width, row height, image size, font sizes, spacing) were
// measured directly from a real reference document's XML, not eyeballed. It's a single
// borderless table cell spanning nearly the full page height with its content vertically
// centered (Word's `vAlign: center` on the cell), which is what makes the whole block sit
// in the middle of the page — a column of plain top-aligned paragraphs (the first version
// of this file) does not reproduce that. Neither generated file is ever uploaded anywhere —
// downloadDocxBlob triggers a direct browser download.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  HeightRule,
  BorderStyle,
} from "docx";
import logoUrl from "../assets/work-hard-be-humble.jpg";

const DEPARTMENT_NAME = "Greensboro Fire Department Training Division";

// Measured from the reference document (word/document.xml), all in docx's native units
// (dxa = twentieths of a point). Page size/margins matter as much as the table's own
// dimensions: the library defaults to A4 with 1in margins, not Letter with 0.5in margins
// like the reference — leaving them unset was what pushed the cover onto a second page.
const PAGE_SIZE = { width: 12240, height: 15840 }; // US Letter
const PAGE_MARGIN = { top: 720, right: 720, bottom: 720, left: 720 }; // 0.5in each side
const PAGE_WIDTH_DXA = 11520; // 8in usable width — table spans it edge to edge
const COVER_ROW_HEIGHT_DXA = 13400; // a touch under the reference's 13824 — leaves a little
// more headroom against the page margins above so nothing spills onto a second page
const LOGO_WIDTH_PX = 390; // 4.0625in at 96dpi — matches the reference image's exact EMU size
const LOGO_HEIGHT_PX = 540; // 5.625in at 96dpi
const DEPARTMENT_NAME_SIZE = 72; // 36pt
const CLASS_LINE_SIZE = 66; // 33pt
const EXAM_NAME_SIZE = 66; // 33pt, bold
const NAME_ID_LINE_SIZE = 40; // 20pt
const QUESTION_SIZE = 32; // 16pt

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const TABLE_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

// Cached across calls — the logo is static, so Generate Paper immediately followed by
// Generate Key (or clicking either twice) shouldn't re-fetch it from the network each time.
let logoBufferPromise = null;
function loadLogoBuffer() {
  if (!logoBufferPromise) {
    logoBufferPromise = fetch(logoUrl).then((response) => response.arrayBuffer());
  }
  return logoBufferPromise;
}

/** A run of underlined blank spaces — real Word underline formatting, not just
 * whitespace, so it renders as a clearly visible line to write on. */
function blankLine(size, spaceCount) {
  return new TextRun({ text: " ".repeat(spaceCount), size, underline: {} });
}

/** The full-page-height, vertically-centered cover block — used as-is for the exam paper
 * (with the student Name/ID line) and, in compact form, is NOT reused for the answer key,
 * which gets a smaller header instead (see answerKeyHeaderParagraphs) since padding a
 * grader's quick-reference document with a full blank page reads as a mistake, not fidelity
 * to the reference. */
function coverPageTable(logoBuffer, { classNumber, coverExamName }) {
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
  cellChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Name: ", size: NAME_ID_LINE_SIZE }),
        blankLine(NAME_ID_LINE_SIZE, 30),
        new TextRun({ text: "   Lawson: ", size: NAME_ID_LINE_SIZE }),
        blankLine(NAME_ID_LINE_SIZE, 20),
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
        // ATLEAST, not EXACT: the cell's content isn't fixed — Class Number and Exam Name
        // are optional and add paragraphs — so an exact height risks Word clipping whatever
        // paragraph doesn't fit (in practice, the last one: the Name/Lawson write-in line,
        // which read as "missing" even though it was present in the document). ATLEAST still
        // hits this target height when content is short, but grows instead of clipping when
        // it's not.
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

function answerKeyHeaderParagraphs(logoBuffer, title) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: DEPARTMENT_NAME, bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new ImageRun({ type: "jpg", data: logoBuffer, transformation: { width: 90, height: 125 } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: `${title} — Answer Key`, bold: true, size: 28 })],
    }),
  ];
}

// The bank's stem text embeds the fill-in-the-blank spot in one of two ways depending on how
// the question was authored in LXR Test: a run of plain spaces mid-sentence (e.g.
// "a          should be placed on the ground"), or — far more commonly, per the real sample
// bank — a run of literal underscores (e.g. "the__________ of the hydrant"). Either way
// that's where the blank actually belongs, not appended after the whole sentence. Matching
// only spaces (as this used to) left every underscore-style blank both printed as literal
// underscore characters AND had a second, redundant blank appended at the end — the
// "doubled up" blank lines. 3+ consecutive spaces or 2+ consecutive underscores reliably
// distinguishes an embedded blank from ordinary spacing/punctuation between words.
const EMBEDDED_BLANK_PATTERN = / {3,}|_{2,}/g;

/** Splits stemText on its embedded blank(s) and returns the runs to render in place —
 * underlined blank space for the exam paper, a compact "____" marker for the answer key
 * (which shows the answer separately, so a heavy underline there is unnecessary). Falls
 * back to appending one blank at the end if the stem has no embedded blank at all. */
function stemRuns(stemText, size, withBlank) {
  const parts = stemText.split(EMBEDDED_BLANK_PATTERN);
  if (parts.length === 1) {
    const runs = [new TextRun({ text: `${stemText.trim()} `, size })];
    if (withBlank) runs.push(blankLine(size, 24));
    return runs;
  }
  const runs = [];
  parts.forEach((part, i) => {
    if (part) runs.push(new TextRun({ text: part, size }));
    if (i < parts.length - 1) {
      runs.push(withBlank ? blankLine(size, 18) : new TextRun({ text: " ____ ", size }));
    }
  });
  return runs;
}

/** withBlank: true for the exam paper (underlined space to write the answer, in place of
 * the bank's embedded blank), false for the answer key (a compact marker plus the real
 * answer text appended). */
function questionParagraph(index, question, withBlank) {
  const runs = [
    new TextRun({ text: `${index + 1}. `, bold: true, size: QUESTION_SIZE }),
    ...stemRuns(question.stemText, QUESTION_SIZE, withBlank),
  ];
  if (!withBlank) {
    runs.push(new TextRun({ text: `— ${question.answerText}`, size: QUESTION_SIZE, italics: true }));
  }
  return new Paragraph({ spacing: { after: 560 }, indent: { hanging: 260 }, children: runs });
}

export async function buildExamPaperDocx({ classNumber, coverExamName, questions }) {
  const logoBuffer = await loadLogoBuffer();
  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
        children: [
          coverPageTable(logoBuffer, { classNumber, coverExamName }),
          new Paragraph({ children: [new PageBreak()] }),
          ...questions.map((q, i) => questionParagraph(i, q, true)),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function buildAnswerKeyDocx({ examName, coverExamName, questions }) {
  const logoBuffer = await loadLogoBuffer();
  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
        children: [
          ...answerKeyHeaderParagraphs(logoBuffer, coverExamName || examName),
          ...questions.map((q, i) => questionParagraph(i, q, false)),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export function downloadDocxBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
