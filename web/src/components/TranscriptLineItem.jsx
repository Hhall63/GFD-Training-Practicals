// web/src/components/TranscriptLineItem.jsx
import { RESULT } from "../lib/constants";

function formatDate(dateMs) {
  return dateMs ? new Date(dateMs).toLocaleDateString("en-US", { dateStyle: "medium" }) : "";
}

export default function TranscriptLineItem({ item }) {
  return (
    <div className="transcript-line-item">
      <div className="transcript-line-item-main">
        <span className="transcript-line-item-name">{item.templateName}</span>
        <span className={`badge ${item.original.result === RESULT.PASS ? "pass" : "fail"}`}>
          {item.original.result === RESULT.PASS ? "PASS" : "FAIL"}
        </span>
        <span className="muted">{formatDate(item.original.dateMs)}</span>
        <span className="muted">{item.original.evaluatorName}</span>
      </div>
      {item.retake && (
        <div className="transcript-line-item-retake muted">
          Retake: {formatDate(item.retake.dateMs)} —{" "}
          {item.retake.result === RESULT.PASS ? "PASS" : "FAIL"} — by {item.retake.evaluatorName}
        </div>
      )}
    </div>
  );
}
