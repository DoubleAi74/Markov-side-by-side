function alignedFinitePairs(left, right) {
  const pairs = [];
  const length = Math.min(left?.length ?? 0, right?.length ?? 0);
  for (let index = 0; index < length; index += 1) {
    if (Number.isFinite(left[index]) && Number.isFinite(right[index])) pairs.push([left[index], right[index]]);
  }
  return pairs;
}

export function compareSummarySeries(coarse, fine) {
  const pairs = alignedFinitePairs(coarse, fine);
  if (!pairs.length) return { comparable: false, points: 0, rmse: Number.NaN, relativeRmse: Number.NaN };
  const squared = pairs.reduce((sum, [a, b]) => sum + (a - b) ** 2, 0);
  const referenceScale = Math.sqrt(pairs.reduce((sum, [, b]) => sum + b ** 2, 0) / pairs.length);
  const rmse = Math.sqrt(squared / pairs.length);
  return { comparable: true, points: pairs.length, rmse, relativeRmse: rmse / Math.max(referenceScale, Number.EPSILON) };
}

export function sdeConvergenceReport({ dt, atDt, atHalfDt, atQuarterDt }) {
  if (!(Number.isFinite(dt) && dt > 0)) throw new RangeError("dt must be positive and finite.");
  const coarseToHalf = compareSummarySeries(atDt, atHalfDt);
  const halfToQuarter = compareSummarySeries(atHalfDt, atQuarterDt);
  return {
    method: "step-halving",
    levels: [dt, dt / 2, dt / 4],
    coarseToHalf,
    halfToQuarter,
    improving: coarseToHalf.comparable && halfToQuarter.comparable && halfToQuarter.rmse < coarseToHalf.rmse,
    caution: "Step-halving agreement is evidence about numerical resolution, not validation of the model itself.",
  };
}

export function ctmpConvergenceReport({ coarseControl, fineControl, coarseSummary, fineSummary }) {
  return {
    method: "control-refinement",
    coarseControl,
    fineControl,
    comparison: compareSummarySeries(coarseSummary, fineSummary),
    caution: "Refine maximum freezing intervals and hazard integration tolerances until the reported estimand stabilises.",
  };
}
