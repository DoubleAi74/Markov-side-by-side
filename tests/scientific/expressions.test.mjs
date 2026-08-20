import test from "node:test";
import assert from "node:assert/strict";
import { compileExpressionSafe, evaluateBytecode, ExpressionError, parseExpression } from "../../lib/expressions/index.js";
import { compileModelV2 } from "../../lib/simulation/index.js";
import { deterministicEntityId, safeRenameModel } from "../../lib/model-v2/index.js";

const variable = { id: deterministicEntityId("test", "variable", 0, "X"), name: "X", kind: "variable" };
const parameter = { id: deterministicEntityId("test", "parameter", 0, "k"), name: "k", kind: "parameter" };

test("safe expression bytecode is serialisable and computes arithmetic", () => {
  const program = compileExpressionSafe("k * X^2 + sin(time)", [variable, parameter]);
  assert.equal(JSON.parse(JSON.stringify(program)).version, 1);
  const value = evaluateBytecode(program, { time: Math.PI / 2, values: { [variable.id]: 3, [parameter.id]: 2 } });
  assert.ok(Math.abs(value - 19) < 1e-12);
  assert.equal(evaluateBytecode(compileExpressionSafe("-2^2 + 2**3", [])), 4);
});

test("lexer rejects JavaScript escape hatches and random", () => {
  for (const source of ["globalThis.process", "x; alert(1)", "({}).constructor", "x = 2", "'text'"]) {
    assert.throws(() => parseExpression(source), ExpressionError, source);
  }
  assert.throws(() => compileExpressionSafe("random()", []), (error) => error.code === "RANDOM_FORBIDDEN");
});

test("errors retain source ranges and parser enforces depth", () => {
  assert.throws(() => compileExpressionSafe("X + missing", [variable]), (error) => error.code === "UNKNOWN_SYMBOL" && error.range.start === 4);
  assert.throws(() => parseExpression("(".repeat(20) + "1" + ")".repeat(20), { maxDepth: 8 }), (error) => error.code === "EXPRESSION_TOO_DEEP");
});

test("safe rename rewrites only resolved tokens and is transactional", () => {
  const model = {
    variables: [{ ...variable, initialValue: 2 }], parameters: [{ ...parameter, value: 3 }], helpers: [], noiseSources: [], sdeComponents: [],
    transitions: [{ id: deterministicEntityId("test", "transition", 0), rate: "X + max(X, k)", changes: [] }],
  };
  const renamed = safeRenameModel(model, variable.id, "Population");
  assert.equal(renamed.transitions[0].rate, "Population + max(Population, k)");
  assert.equal(model.transitions[0].rate, "X + max(X, k)");
  assert.throws(() => safeRenameModel(model, variable.id, "k"));
  assert.equal(model.variables[0].name, "X");
});

test("named helpers execute as bytecode and dependency cycles are rejected", () => {
  const helperA = { id: deterministicEntityId("test", "helper", 0, "Season"), name: "Season", expression: "1 + sin(t)" };
  const model = {
    format: "markov-lab/model", version: 2, solverFamily: "ctmp-inhomo",
    variables: [{ ...variable, initialValue: 2 }], parameters: [], helpers: [helperA], noiseSources: [], sdeComponents: [], correlations: null, plots: [],
    transitions: [{ id: deterministicEntityId("test", "transition", 3), rate: "X * Season(t)", changes: [] }],
    settings: { solver: "ctmp-integrated-hazard-v1", seed: "1", tMax: 1, runs: 1, tolerance: 1e-7 },
  };
  const { model: compiled } = compileModelV2(model);
  assert.equal(evaluateBytecode(compiled.transitions[0].rateBytecode, { time: Math.PI / 2, values: { [variable.id]: 2 }, helpers: compiled.helperBytecode }), 4);
  const cycle = structuredClone(model);
  cycle.helpers.push({ id: deterministicEntityId("test", "helper", 1, "Other"), name: "Other", expression: "Season(t)" });
  cycle.helpers[0].expression = "Other(t)";
  assert.throws(() => compileModelV2(cycle), (error) => error.code === "HELPER_CYCLE");
});
