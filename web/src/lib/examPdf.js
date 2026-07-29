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
