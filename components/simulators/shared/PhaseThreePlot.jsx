"use client";

function pointsFor(dataset, limit = 420) {
  const values = Array.isArray(dataset?.data) ? dataset.data : [];
  const stride = Math.max(1, Math.ceil(values.length / limit));
  return values.filter((_, index) => index % stride === 0);
}

function alignedRawTriples(datasets, limit = 420) {
  if (datasets.length < 3 || !datasets.every((dataset) => dataset?.rawValues instanceof Float64Array) || !datasets.every((dataset) => dataset.rawTimes === datasets[0].rawTimes)) return null;
  const length = datasets[0].rawTimes.length;
  const stride = Math.max(1, Math.ceil(length / limit));
  const indices = Array.from({ length: Math.ceil(length / stride) }, (_, index) => Math.min(index * stride, length - 1));
  if (indices.at(-1) !== length - 1) indices.push(length - 1);
  return indices.map((rowIndex) => datasets.map((dataset) => Number(dataset.rawValues[rowIndex * dataset.rawStateCount + dataset.rawVariableIndex])));
}

export default function PhaseThreePlot({ datasets = [] }) {
  const [xSeries, ySeries, zSeries] = datasets;
  const aligned = alignedRawTriples(datasets.slice(0, 3));
  const x = aligned ? [] : pointsFor(xSeries);
  const y = aligned ? [] : pointsFor(ySeries);
  const z = aligned ? [] : pointsFor(zSeries);
  const length = aligned?.length ?? Math.min(x.length, y.length, z.length);

  if (length < 2) {
    return (
      <div className="plot-empty" role="status">
        A 3D phase portrait needs results for at least three state variables.
      </div>
    );
  }

  const triples = aligned ?? Array.from({ length }, (_, index) => [
    Number(x[index]?.y ?? 0),
    Number(y[index]?.y ?? 0),
    Number(z[index]?.y ?? 0),
  ]);
  const mins = [0, 1, 2].map((axis) =>
    Math.min(...triples.map((point) => point[axis])),
  );
  const spans = [0, 1, 2].map(
    (axis) => Math.max(...triples.map((point) => point[axis])) - mins[axis] || 1,
  );
  const projected = triples.map(([px, py, pz]) => {
    const nx = (px - mins[0]) / spans[0];
    const ny = (py - mins[1]) / spans[1];
    const nz = (pz - mins[2]) / spans[2];
    return [54 + nx * 410 + nz * 82, 270 - ny * 210 - nz * 54];
  });
  const path = projected
    .map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      className="analysis-svg"
      viewBox="0 0 560 310"
      role="img"
      aria-labelledby="phase-three-title phase-three-description"
    >
      <title id="phase-three-title">Projected three-dimensional phase portrait</title>
      <desc id="phase-three-description">
        A perspective projection of the first three state variables over time.
      </desc>
      <path className="plot-grid-line" d="M54 270H468L550 216M54 270V60M468 270V60L550 6V216" />
      <path d={path} fill="none" stroke="#146c72" strokeWidth="2.2" />
      <circle cx={projected[0][0]} cy={projected[0][1]} r="5" fill="#146c72" />
      <rect x={projected.at(-1)[0] - 5} y={projected.at(-1)[1] - 5} width="10" height="10" fill="#b75436" />
      <text x="476" y="290">{xSeries?.label || "x"}</text>
      <text x="12" y="56">{ySeries?.label || "y"}</text>
      <text x="508" y="28">{zSeries?.label || "z"}</text>
    </svg>
  );
}
