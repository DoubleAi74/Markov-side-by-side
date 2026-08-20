import { evaluateBytecode } from "../expressions/bytecode.js";

export function evaluateNumeric(spec, context) {
  if (typeof spec === "number") return spec;
  if (typeof spec === "function") return spec(context.state, context.time, context.parameters);
  if (spec?.version && spec?.instructions) return evaluateBytecode(spec, context.bytecode ?? context);
  if (spec?.bytecode) return evaluateBytecode(spec.bytecode, context.bytecode ?? context);
  throw new TypeError("Expected numeric value, bytecode, or trusted internal evaluator.");
}

export function makeEvaluationContext(model, state, time) {
  const values = {};
  (model.variables ?? []).forEach((variable, index) => { values[variable.id] = state[index]; });
  (model.parameters ?? []).forEach((parameter) => { values[parameter.id] = parameter.value; });
  return { state, time, parameters: Object.fromEntries((model.parameters ?? []).map((p) => [p.name, p.value])), bytecode: { time, values, helpers: model.helperBytecode ?? {} } };
}
