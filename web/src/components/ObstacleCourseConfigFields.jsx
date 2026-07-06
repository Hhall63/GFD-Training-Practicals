const PENALTY_LABELS = {
  cones: "Cones",
  lineCrossings: "Line Crossings",
  stopLine: "Stop Line",
  stoppingDistance: "Stopping Distance",
};

export default function ObstacleCourseConfigFields({ config, onChange }) {
  function update(patch) {
    onChange({ ...config, ...patch });
  }
  function updateObstacle(index, patch) {
    const obstacles = config.obstacles.map((o, i) => (i === index ? { ...o, ...patch } : o));
    update({ obstacles });
  }
  function updateObstaclePenalty(index, key, value) {
    const obstacle = config.obstacles[index];
    updateObstacle(index, { penalties: { ...obstacle.penalties, [key]: value } });
  }
  function addObstacle() {
    update({
      obstacles: [
        ...config.obstacles,
        {
          label: `Obstacle ${config.obstacles.length + 1}`,
          penalties: { cones: true, lineCrossings: true, stopLine: false, stoppingDistance: false },
        },
      ],
    });
  }
  function removeObstacle(index) {
    update({ obstacles: config.obstacles.filter((_, i) => i !== index) });
  }
  function updateTierPoints(index, points) {
    const timeTiers = config.timeTiers.map((t, i) => (i === index ? { ...t, points: Number(points) } : t));
    update({ timeTiers });
  }
  function updateTierMax(index, maxSeconds) {
    const timeTiers = config.timeTiers.map((t, i) =>
      i === index ? { ...t, maxSeconds: maxSeconds === "" ? null : Number(maxSeconds) } : t
    );
    update({ timeTiers });
  }
  function updateStoppingDistanceTier(index, value) {
    const stoppingDistancePenaltyTiers = config.stoppingDistancePenaltyTiers.map((t, i) => (i === index ? value : t));
    update({ stoppingDistancePenaltyTiers });
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Always worth 100 points and always a critical (automatic-failure) step. Configure the
        obstacles, penalties, and time-to-score table below to match your department's form.
      </p>

      <div className="field">
        <label>Obstacles</label>
        {config.obstacles.map((obstacle, i) => (
          <div key={i} className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input
                type="text"
                value={obstacle.label}
                onChange={(e) => updateObstacle(i, { label: e.target.value })}
                style={{ marginBottom: 0 }}
              />
              <button
                type="button"
                className="secondary"
                style={{ width: "auto", padding: "6px 10px", color: "var(--brand-red)" }}
                onClick={() => removeObstacle(i)}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {Object.entries(PENALTY_LABELS).map(([key, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(obstacle.penalties[key])}
                    onChange={(e) => updateObstaclePenalty(i, key, e.target.checked)}
                    style={{ width: "auto", margin: 0 }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className="secondary" onClick={addObstacle}>+ Add Obstacle</button>
      </div>

      <div className="field">
        <label>Penalty Point Values (deducted from base score)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LabeledNumber label="Per Cone" value={config.conePenaltyPoints} onChange={(v) => update({ conePenaltyPoints: v })} />
          <LabeledNumber label="Per Line Crossing" value={config.lineCrossingPenaltyPoints} onChange={(v) => update({ lineCrossingPenaltyPoints: v })} />
          <LabeledNumber label="Stop Line Missed" value={config.stopLinePenaltyPoints} onChange={(v) => update({ stopLinePenaltyPoints: v })} />
        </div>
      </div>

      <div className="field">
        <label>Stopping Distance Penalty Tiers</label>
        <div style={{ display: "flex", gap: 8 }}>
          {config.stoppingDistancePenaltyTiers.map((v, i) => (
            <LabeledNumber
              key={i}
              label={`Tier ${i + 1}`}
              value={v}
              onChange={(nv) => updateStoppingDistanceTier(i, nv)}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label>Time → Base Score</label>
        {config.timeTiers.map((tier, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, width: 80 }}>≤ seconds</span>
            <input
              type="number"
              placeholder="no cap"
              value={tier.maxSeconds ?? ""}
              onChange={(e) => updateTierMax(i, e.target.value)}
              style={{ marginBottom: 0, width: 90 }}
              disabled={i === config.timeTiers.length - 1}
            />
            <span>=</span>
            <input
              type="number"
              value={tier.points}
              onChange={(e) => updateTierPoints(i, e.target.value)}
              style={{ marginBottom: 0, width: 70 }}
            />
            <span>pts</span>
          </div>
        ))}
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Automatic Failure Thresholds</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LabeledNumber label="Cone penalties ≥" value={config.maxConePenalties} onChange={(v) => update({ maxConePenalties: v })} />
          <LabeledNumber label="Total seconds ≥" value={config.maxTotalSeconds} onChange={(v) => update({ maxTotalSeconds: v })} />
        </div>
      </div>
    </div>
  );
}

function LabeledNumber({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 90, marginBottom: 0 }}
      />
    </div>
  );
}
