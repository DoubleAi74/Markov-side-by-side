import { ExpressionError } from "./errors.js";

export const MATH_FUNCTIONS = Object.freeze({
  sin: { arity: 1, fn: Math.sin }, cos: { arity: 1, fn: Math.cos }, tan: { arity: 1, fn: Math.tan },
  asin: { arity: 1, fn: Math.asin }, acos: { arity: 1, fn: Math.acos }, atan: { arity: 1, fn: Math.atan },
  atan2: { arity: 2, fn: Math.atan2 }, exp: { arity: 1, fn: Math.exp }, log: { arity: 1, fn: Math.log },
  log10: { arity: 1, fn: Math.log10 }, sqrt: { arity: 1, fn: Math.sqrt }, abs: { arity: 1, fn: Math.abs },
  floor: { arity: 1, fn: Math.floor }, ceil: { arity: 1, fn: Math.ceil }, round: { arity: 1, fn: Math.round },
  sign: { arity: 1, fn: Math.sign }, pow: { arity: 2, fn: Math.pow }, min: { minArity: 1, fn: Math.min }, max: { minArity: 1, fn: Math.max },
});
export const CONSTANTS = Object.freeze({ PI: Math.PI, E: Math.E });
export const RESERVED_SYMBOL_NAMES = Object.freeze(new Set([
  "t", "time", "random",
  ...Object.keys(CONSTANTS),
  ...Object.keys(MATH_FUNCTIONS),
]));

/** Resolve identifiers onto stable entity IDs. Mutates only a cloned AST. */
export function resolveExpression(ast, symbols = [], helpers = []) {
  const byName = new Map();
  for (const symbol of symbols) {
    if (!symbol?.name || !symbol?.id) throw new TypeError("Symbols require name and stable id.");
    if (RESERVED_SYMBOL_NAMES.has(symbol.name)) throw new ExpressionError("RESERVED_SYMBOL", `${JSON.stringify(symbol.name)} is reserved by the expression language.`, "");
    if (byName.has(symbol.name)) throw new Error(`Duplicate symbol ${JSON.stringify(symbol.name)}.`);
    byName.set(symbol.name, symbol);
  }
  const helperNames = new Map();
  for (const helper of helpers) {
    if (!helper?.name || !helper?.id) throw new TypeError("Helpers require name and stable id.");
    if (RESERVED_SYMBOL_NAMES.has(helper.name)) throw new ExpressionError("RESERVED_SYMBOL", `${JSON.stringify(helper.name)} is reserved by the expression language.`, "");
    if (byName.has(helper.name) || helperNames.has(helper.name)) throw new ExpressionError("DUPLICATE_SYMBOL", `Duplicate symbol ${JSON.stringify(helper.name)}.`, "");
    helperNames.set(helper.name, helper);
  }
  function visit(node) {
    const copy = { ...node, range: { ...node.range } };
    if (node.type === "Literal") return copy;
    if (node.type === "Identifier") {
      if (node.name === "t" || node.name === "time") return { ...copy, type: "ResolvedSymbol", ref: { kind: "time", id: "time" } };
      if (Object.hasOwn(CONSTANTS, node.name)) return { ...copy, type: "Literal", value: CONSTANTS[node.name] };
      const symbol = byName.get(node.name);
      if (!symbol) throw new ExpressionError("UNKNOWN_SYMBOL", `Unknown symbol ${JSON.stringify(node.name)}.`, "", node.range.start, node.range.end);
      return { ...copy, type: "ResolvedSymbol", ref: { kind: symbol.kind ?? "symbol", id: symbol.id } };
    }
    if (node.type === "UnaryExpression") return { ...copy, argument: visit(node.argument) };
    if (node.type === "BinaryExpression") return { ...copy, left: visit(node.left), right: visit(node.right) };
    if (node.type === "CallExpression") {
      if (node.callee === "random") throw new ExpressionError("RANDOM_FORBIDDEN", "random() is not allowed; stochasticity is controlled by the solver seed.", "", node.calleeRange.start, node.calleeRange.end);
      const math = MATH_FUNCTIONS[node.callee];
      const helper = helperNames.get(node.callee);
      if (!math && !helper) throw new ExpressionError("UNKNOWN_FUNCTION", `Unknown function ${JSON.stringify(node.callee)}.`, "", node.calleeRange.start, node.calleeRange.end);
      if (math && ((math.arity != null && node.arguments.length !== math.arity) || (math.minArity != null && node.arguments.length < math.minArity))) {
        throw new ExpressionError("INVALID_ARITY", `${node.callee}() received ${node.arguments.length} argument(s).`, "", node.range.start, node.range.end);
      }
      if (helper && node.arguments.length !== (helper.arity ?? 1)) throw new ExpressionError("INVALID_ARITY", `${node.callee}() has invalid arity.`, "", node.range.start, node.range.end);
      return { ...copy, arguments: node.arguments.map(visit), target: math ? { kind: "math", id: node.callee } : { kind: "helper", id: helper.id } };
    }
    throw new TypeError(`Unknown AST node ${node.type}.`);
  }
  return visit(ast);
}
