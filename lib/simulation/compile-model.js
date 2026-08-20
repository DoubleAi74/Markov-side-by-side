import { parseExpression } from "../expressions/parser.js";
import { resolveExpression } from "../expressions/resolver.js";
import { compileBytecode } from "../expressions/bytecode.js";
import { validateModelV2 } from "../model-v2/schema.js";
import { sha256Hex } from "../model-v2/hash.js";
import { SimulationError } from "./errors.js";

function helperDependencies(ast, found = new Set()) {
  if (ast.target?.kind === "helper") found.add(ast.target.id);
  if (ast.argument) helperDependencies(ast.argument, found);
  if (ast.left) helperDependencies(ast.left, found);
  if (ast.right) helperDependencies(ast.right, found);
  ast.arguments?.forEach((child) => helperDependencies(child, found));
  return found;
}

function findTimeReference(ast) {
  if (ast.type === "ResolvedSymbol" && ast.ref?.kind === "time") return ast.range;
  for (const child of [ast.argument, ast.left, ast.right, ...(ast.arguments ?? [])]) {
    if (!child) continue;
    const found = findTimeReference(child);
    if (found) return found;
  }
  return null;
}

function assertAcyclic(graph) {
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new SimulationError("HELPER_CYCLE", "Time helper functions contain a dependency cycle.", { helperId: id });
    if (visited.has(id)) return;
    visiting.add(id); for (const dependency of graph.get(id) ?? []) visit(dependency); visiting.delete(id); visited.add(id);
  }
  for (const id of graph.keys()) visit(id);
}

/** Compile canonical model expressions to serialisable stack bytecode. */
export function compileModelV2(model, limits) {
  if (model?.needsRepair) throw new SimulationError("MODEL_NEEDS_REPAIR", "This legacy model must be repaired before it can execute.", { issues: model.repairIssues });
  const validity = validateModelV2(model);
  if (!validity.ok) throw new SimulationError("INVALID_MODEL", "Model validation failed.", { issues: validity.issues });
  const compiled = structuredClone(model);
  const symbols = [...compiled.variables.map((x) => ({ ...x, kind: "variable" })), ...compiled.parameters.map((x) => ({ ...x, kind: "parameter" }))];
  const helpers = compiled.helpers ?? [], helperBytecode = {}, helperAsts = new Map(), graph = new Map();
  for (const helper of helpers) {
    const ast = resolveExpression(parseExpression(helper.expression, limits), symbols, helpers);
    helperAsts.set(helper.id, ast);
    graph.set(helper.id, helperDependencies(ast)); helperBytecode[helper.id] = compileBytecode(ast);
  }
  assertAcyclic(graph); compiled.helperBytecode = helperBytecode;
  if (compiled.settings.solver === "gillespie-direct-v2") {
    for (const helper of helpers) {
      const range = findTimeReference(helperAsts.get(helper.id));
      if (range) throw new SimulationError("TIME_DEPENDENT_DIRECT_SSA", "Gillespie direct SSA does not permit time-dependent helper functions; use integrated-hazard CTMP.", { helperId: helper.id, range });
    }
  }
  for (const transition of compiled.transitions ?? []) {
    const ast = resolveExpression(parseExpression(transition.rate, limits), symbols, helpers);
    const range = compiled.settings.solver === "gillespie-direct-v2" ? findTimeReference(ast) : null;
    if (range) throw new SimulationError("TIME_DEPENDENT_DIRECT_SSA", "Gillespie direct SSA requires time-homogeneous rates; use integrated-hazard CTMP.", { transitionId: transition.id, range });
    transition.rateBytecode = compileBytecode(ast);
  }
  for (const component of compiled.sdeComponents ?? []) {
    component.driftBytecode = compileBytecode(resolveExpression(parseExpression(component.drift, limits), symbols, helpers));
    for (const entry of component.diffusion ?? []) entry.bytecode = compileBytecode(resolveExpression(parseExpression(entry.expression, limits), symbols, helpers));
    if (component.diffusionDerivative != null) component.diffusionDerivativeBytecode = compileBytecode(resolveExpression(parseExpression(component.diffusionDerivative, limits), symbols, helpers));
  }
  return { model: compiled, modelHash: sha256Hex(model), bytecodeVersion: 1 };
}
