import DOMPurify from "dompurify";

const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "p", "br"];

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html ?? "", { ALLOWED_TAGS });
}

export function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html ?? ""), "text/html");
  return doc.body.textContent ?? "";
}
