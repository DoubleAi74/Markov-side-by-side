import test from "node:test";
import assert from "node:assert/strict";
import { sdeConvergenceReport } from "../../lib/analysis/convergence.js";

test("SDE convergence assistant reports improvement under step halving", () => {
  const report = sdeConvergenceReport({
    dt: 0.1,
    atDt: [1, 2.2, 2.8],
    atHalfDt: [1, 2.05, 2.95],
    atQuarterDt: [1, 2.01, 2.99],
  });
  assert.deepEqual(report.levels, [0.1, 0.05, 0.025]);
  assert.equal(report.improving, true);
});
