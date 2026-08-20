import test from "node:test";
import assert from "node:assert/strict";
import { buildHelperBlock, compileExpression } from "../../lib/compile.js";

test("legacy editor callable uses safe bytecode", () => {
  const rate = compileExpression("k * A + sin(t)", ["A"], ["k"]);
  assert.ok(Array.isArray(rate.bytecode.instructions));
  assert.equal(rate([3], Math.PI / 2, { k: 2 }), 7);
});

test("legacy CTMP helpers remain source-free", () => {
  const helpers = buildHelperBlock([{ name: "Season", body: "base + sin(t)" }], ["base"]);
  const rate = compileExpression("A * Season(t)", ["A"], ["base"], helpers);
  assert.equal(rate([2], Math.PI / 2, { base: 3 }), 8);
});

test("injection syntax and expression-level randomness are rejected", () => {
  assert.throws(() => compileExpression("globalThis.alert(1)", [], []), /Invalid|Unexpected|token|function/i);
  assert.throws(() => compileExpression("random()", [], []), /not allowed/i);
});
