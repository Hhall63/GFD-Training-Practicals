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

// Measured from the reference document (word/document.xml), all in docx's native units.
const PAGE_WIDTH_DXA = 11520; // 8in usable width — table spans it edge to edge
const COVER_ROW_HEIGHT_DXA = 13824; // ~9.6in — forces the row tall enough that vAlign:center
// on the cell visually centers the whole block in the middle of the page
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

async function loadLogoBuffer() {
  const response = await fetch(logoUrl);
  return response.arrayBuffer();
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
        new TextRun({ text: "   ID: ", size: NAME_ID_LINE_SIZE }),
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
        height: { value: COVER_ROW_HEIGHT_DXA, rule: HeightRule.EXACT },
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

/** withBlank: true for the exam paper (underlined space to write the answer), false for
 * the answer key (the real answer text instead). */
function questionParagraph(index, question, withBlank) {
  const runs = [
    new TextRun({ text: `${index + 1}. `, bold: true, size: QUESTION_SIZE }),
    new TextRun({ text: `(${question.points} pt) ${question.stemText} `, size: QUESTION_SIZE }),
  ];
  runs.push(
    withBlank
      ? blankLine(QUESTION_SIZE, 24)
      : new TextRun({ text: question.answerText, size: QUESTION_SIZE, italics: true })
  );
  return new Paragraph({ spacing: { after: 560 }, indent: { hanging: 260 }, children: runs });
}

export async function buildExamPaperDocx({ classNumber, coverExamName, questions }) {
  const logoBuffer = await loadLogoBuffer();
  const doc = new Document({
    sections: [
      {
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
