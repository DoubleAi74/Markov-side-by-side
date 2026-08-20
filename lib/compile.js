// Compatibility facade for the legacy simulator editors. User expressions are
// parsed into source-located ASTs and serialisable bytecode; no JavaScript source
// is ever constructed or executed.
import { compileExpressionSafe, evaluateBytecode } from "./expressions/index.js";

function symbolDefinitions(varNames, paramNames) {
  return [
    ...varNames.map((name) => ({ id: `variable:${name}`, name, kind: "variable" })),
    ...paramNames.map((name) => ({ id: `parameter:${name}`, name, kind: "parameter" })),
  ];
}

function helperDefinitions(helperDescriptor) {
  return (helperDescriptor?.helpers ?? []).map((helper) => ({ id: `helper:${helper.name}`, name: helper.name, arity: 1 }));
}

function compileHelpers(helperDescriptor, symbols) {
  const definitions = helperDefinitions(helperDescriptor);
  const programs = {};
  for (const helper of helperDescriptor?.helpers ?? []) {
    programs[`helper:${helper.name}`] = compileExpressionSafe(helper.body, symbols, definitions);
  }

  const graph = new Map(Object.entries(programs).map(([id, program]) => [
    id,
    new Set(program.instructions.filter((instruction) => instruction[0] === "call" && instruction[1] === "helper").map((instruction) => instruction[2])),
  ]));
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Time function dependency cycle involving ${JSON.stringify(id.slice(7))}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) visit(id);
  return { definitions, programs };
}

/**
 * Compile a safe math expression into the legacy callable interface.
 * The returned function carries its serialisable bytecode as `.bytecode`.
 */
export function compileExpression(expr, varNames, paramNames, helperDescriptor = null) {
  if (!expr || !String(expr).trim()) return Object.assign(() => 0, { bytecode: { version: 1, instructions: [["const", 0]] } });
  const symbols = symbolDefinitions(varNames, paramNames);
  const helpers = compileHelpers(helperDescriptor, symbols);
  const bytecode = compileExpressionSafe(String(expr).trim(), symbols, helpers.definitions);
  const evaluator = (state, time, parameters = {}) => {
    const values = {};
    varNames.forEach((name, index) => { values[`variable:${name}`] = Number(state[index]); });
    paramNames.forEach((name) => { values[`parameter:${name}`] = Number(parameters[name]); });
    return evaluateBytecode(bytecode, { time, values, helpers: helpers.programs });
  };
  return Object.assign(evaluator, { bytecode });
}

/**
 * Retained name for editor compatibility. This now returns inert structured
 * helper definitions instead of JavaScript function declarations.
 */
export function buildHelperBlock(helpers, paramNames = []) {
  return Object.freeze({
    kind: "markov-lab/safe-helpers",
    helpers: (helpers ?? []).filter((helper) => helper?.name && helper?.body).map((helper) => ({ name: helper.name, body: helper.body })),
    paramNames: [...paramNames],
  });
}
