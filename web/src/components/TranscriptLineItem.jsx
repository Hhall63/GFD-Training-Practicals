// web/src/components/TranscriptLineItem.jsx
import { RESULT } from "../lib/constants";

function formatDate(dateMs) {
  return dateMs ? new Date(dateMs).toLocaleDateString("en-US", { dateStyle: "medium" }) : "";
}

/** One result row — used for both the original attempt and, when present, the retake, so the
 * two render at identical size/format instead of the retake being a shrunken footnote. */
function ResultRow({ label, result, dateMs, evaluatorName }) {
  return (
    <div className="transcript-line-item-main">
      <span className="transcript-line-item-name">{label}</span>
      <span className={`badge ${result === RESULT.PASS ? "pass" : "fail"}`}>
        {result === RESULT.PASS ? "PASS" : "FAIL"}
      </span>
      <span className="muted">{formatDate(dateMs)}</span>
      <span className="muted">{evaluatorName}</span>
    </div>
  );
}

export default function TranscriptLineItem({ item }) {
  return (
    <div className="transcript-line-item">
      <ResultRow
        label={item.templateName}
        result={item.original.result}
        dateMs={item.original.dateMs}
        evaluatorName={item.original.evaluatorName}
      />
      {item.retake && (
        <ResultRow
          label="Retake"
          result={item.retake.result}
          dateMs={item.retake.dateMs}
          evaluatorName={item.retake.evaluatorName}
        />
      )}
    </div>
  );
}
