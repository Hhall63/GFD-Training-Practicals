// web/src/components/TranscriptHeader.jsx
import badge from "../assets/gfd-badge.png";
import crest from "../assets/work-hard-be-humble.jpg";

export default function TranscriptHeader() {
  return (
    <div className="transcript-header">
      <img src={badge} alt="GFD Badge" />
      <h2>Greensboro Fire Department Training Division</h2>
      <img src={crest} alt="Work Hard, Be Humble" />
    </div>
  );
}
