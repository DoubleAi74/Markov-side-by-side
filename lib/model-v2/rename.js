import { parseExpression } from "../expressions/parser.js";
import { resolveExpression } from "../expressions/resolver.js";
import { compileBytecode } from "../expressions/bytecode.js";

function slots(model) {
  const result = [];
  (model.helpers ?? []).forEach((x, i) => result.push({ object: x, key: "expression", path: `helpers.${i}.expression` }));
  (model.transitions ?? []).forEach((x, i) => result.push({ object: x, key: "rate", path: `transitions.${i}.rate` }));
  (model.sdeComponents ?? []).forEach((x, i) => {
    result.push({ object: x, key: "drift", path: `sdeComponents.${i}.drift` });
    (x.diffusion ?? []).forEach((d, j) => result.push({ object: d, key: "expression", path: `sdeComponents.${i}.diffusion.${j}.expression` }));
    if (x.diffusionDerivative != null) result.push({ object: x, key: "diffusionDerivative", path: `sdeComponents.${i}.diffusionDerivative` });
  });
  return result;
}

function references(node, entityId, found = []) {
  if (node.type === "ResolvedSymbol" && node.ref.id === entityId) found.push(node.range);
  if (node.type === "CallExpression" && node.target?.kind === "helper" && node.target.id === entityId) found.push(node.calleeRange);
  if (node.argument) references(node.argument, entityId, found);
  if (node.left) references(node.left, entityId, found);
  if (node.right) references(node.right, entityId, found);
  node.arguments?.forEach((child) => references(child, entityId, found));
  return found;
}

function rewrite(source, ranges, replacement) {
  let value = source;
  for (const range of ranges.sort((a, b) => b.start - a.start)) value = value.slice(0, range.start) + replacement + value.slice(range.end);
  return value;
}

/** Transactional, ID-aware rename. Returns a new model or throws without mutating input. */
export function safeRenameModel(model, entityId, newName) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) throw new Error("New name must be a valid symbol.");
  const clone = structuredClone(model);
  const entities = [...(clone.variables ?? []), ...(clone.parameters ?? []), ...(clone.helpers ?? []), ...(clone.noiseSources ?? [])];
  const target = entities.find((x) => x.id === entityId);
  if (!target) throw new Error("Entity to rename was not found.");
  if (entities.some((x) => x.id !== entityId && x.name === newName)) throw new Error(`Symbol ${JSON.stringify(newName)} already exists.`);
  const oldSymbols = [...(model.variables ?? []).map((x) => ({ ...x, kind: "variable" })), ...(model.parameters ?? []).map((x) => ({ ...x, kind: "parameter" }))];
  const oldHelpers = model.helpers ?? [];
  const cloneSlots = slots(clone), oldSlots = slots(model);
  oldSlots.forEach((slot, index) => {
    const source = String(slot.object[slot.key] ?? "0");
    const resolved = resolveExpression(parseExpression(source), oldSymbols, oldHelpers);
    cloneSlots[index].object[cloneSlots[index].key] = rewrite(source, references(resolved, entityId), newName);
  });
  target.name = newName;
  const newSymbols = [...(clone.variables ?? []).map((x) => ({ ...x, kind: "variable" })), ...(clone.parameters ?? []).map((x) => ({ ...x, kind: "parameter" }))];
  // Validate every expression before committing the clone.
  for (const slot of cloneSlots) compileBytecode(resolveExpression(parseExpression(String(slot.object[slot.key] ?? "0")), newSymbols, clone.helpers ?? []));
  return clone;
}
