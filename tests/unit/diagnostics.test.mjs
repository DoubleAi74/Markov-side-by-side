import test from "node:test";
import assert from "node:assert/strict";
import { autocorrelation, ecdf, firstPassageKaplanMeier, histogram, reactionDiagnostics, welchPsd } from "../../lib/analysis/diagnostics.js";

test("distribution summaries account for excluded non-finite samples", () => {
  const hist = histogram([0, 1, 2, Number.NaN], 2);
  assert.equal(hist.included, 3);
  assert.equal(hist.excluded, 1);
  assert.equal(hist.bins.reduce((sum, bin) => sum + bin.count, 0), 3);
  assert.deepEqual(ecdf([2, 1]).points, [{ value: 1, probability: 0.5 }, { value: 2, probability: 1 }]);
});

test("reaction and censored first-passage diagnostics are explicit", () => {
  const reaction = reactionDiagnostics({ transitionIds: ["birth", "birth", "death"], times: Float64Array.from([0, 0.2, 0.5, 1]) });
  assert.deepEqual(reaction.counts, { birth: 2, death: 1 });
  const km = firstPassageKaplanMeier([{ time: 1, reached: true }, { time: 2, reached: false }, { time: 2, reached: true }]);
  assert.ok(Math.abs(km.curve.at(-1).survival - 1 / 3) < 1e-12);
  assert.equal(km.curve.at(-1).censored, 1);
});

test("ACF and Welch PSD return finite diagnostics for a periodic series", () => {
  const values = Float64Array.from({ length: 128 }, (_, index) => Math.sin((2 * Math.PI * index) / 16));
  const acf = autocorrelation(values, 16);
  assert.equal(acf[0], 1);
  const psd = welchPsd(values, 0.1, 64);
  assert.equal(psd.segments, 3);
  assert.ok(Array.from(psd.power).every(Number.isFinite));
  assert.match(psd.caution, /uniformly sampled/);
});
