// Builds the two printable exam documents as real .docx files, entirely client-side —
// mirrors the department's existing exam-paper letterhead/format: a cover page with the
// department name and Maltese cross logo, a Class Number / Exam Name line typed in fresh
// each generation (never saved), and a blank Name/ID line for the student to hand-write.
// Neither file is ever uploaded anywhere — downloadDocxBlob triggers a direct browser
// download, same pattern the PDF module this replaces used.
import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, PageBreak } from "docx";
import logoUrl from "../assets/work-hard-be-humble.jpg";

const DEPARTMENT_NAME = "Greensboro Fire Department Training Division";

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

function letterheadParagraphs(logoBuffer) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: DEPARTMENT_NAME, bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
      children: [new ImageRun({ type: "jpg", data: logoBuffer, transformation: { width: 120, height: 150 } })],
    }),
  ];
}

function coverPageParagraphs(logoBuffer, { classNumber, coverExamName }) {
  const paragraphs = [...letterheadParagraphs(logoBuffer)];
  if (classNumber) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `${ordinal(Number(classNumber))} Recruit Class`, size: 24 })],
      })
    );
  }
  if (coverExamName) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: coverExamName, size: 24 })],
      })
    );
  }
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({ text: "Name: ", size: 40 }),
        blankLine(40, 30),
        new TextRun({ text: "   ID: ", size: 40 }),
        blankLine(40, 20),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] })
  );
  return paragraphs;
}

/** withBlank: true for the exam paper (underlined space to write the answer), false for
 * the answer key (the real answer text instead). */
function questionParagraph(index, question, withBlank) {
  const runs = [
    new TextRun({ text: `${index + 1}. `, bold: true, size: 32 }),
    new TextRun({ text: `(${question.points} pt) ${question.stemText} `, size: 32 }),
  ];
  runs.push(
    withBlank
      ? blankLine(32, 24)
      : new TextRun({ text: question.answerText, size: 32, italics: true })
  );
  return new Paragraph({ spacing: { after: 560 }, indent: { hanging: 260 }, children: runs });
}

export async function buildExamPaperDocx({ classNumber, coverExamName, questions }) {
  const logoBuffer = await loadLogoBuffer();
  const doc = new Document({
    sections: [
      {
        children: [
          ...coverPageParagraphs(logoBuffer, { classNumber, coverExamName }),
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
          ...letterheadParagraphs(logoBuffer),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [new TextRun({ text: `${coverExamName || examName} — Answer Key`, bold: true, size: 28 })],
          }),
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
