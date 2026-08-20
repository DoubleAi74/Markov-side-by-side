import { MATH_FUNCTIONS } from "./resolver.js";
import { ExpressionError } from "./errors.js";

export const BYTECODE_VERSION = 1;

export function compileBytecode(ast) {
  const instructions = [];
  function emit(node) {
    if (node.type === "Literal") instructions.push(["const", node.value]);
    else if (node.type === "ResolvedSymbol") instructions.push(["load", node.ref.kind, node.ref.id]);
    else if (node.type === "UnaryExpression") { emit(node.argument); instructions.push([node.operator === "-" ? "neg" : "pos"]); }
    else if (node.type === "BinaryExpression") { emit(node.left); emit(node.right); instructions.push(["binary", node.operator]); }
    else if (node.type === "CallExpression") { node.arguments.forEach(emit); instructions.push(["call", node.target.kind, node.target.id, node.arguments.length]); }
    else throw new TypeError(`Cannot compile unresolved node ${node.type}.`);
  }
  emit(ast);
  return { version: BYTECODE_VERSION, instructions };
}

function readValue(context, kind, id) {
  if (kind === "time") return context.time ?? 0;
  if (context.values instanceof Map) return context.values.get(id);
  if (context.values && Object.hasOwn(context.values, id)) return context.values[id];
  if (context[kind] instanceof Map) return context[kind].get(id);
  if (context[kind] && Object.hasOwn(context[kind], id)) return context[kind][id];
  return undefined;
}

/** Pure stack evaluator. Programs are JSON serialisable and contain no source code. */
export function evaluateBytecode(program, context = {}, options = {}) {
  if (!program || program.version !== BYTECODE_VERSION || !Array.isArray(program.instructions)) throw new TypeError("Unsupported expression bytecode.");
  const stack = [];
  const maxOperations = options.maxOperations ?? 100000;
  if (program.instructions.length > maxOperations) throw new ExpressionError("BYTECODE_LIMIT", "Expression operation limit exceeded.", "");
  for (const instruction of program.instructions) {
    const [op, a, b, count] = instruction;
    if (op === "const") stack.push(a);
    else if (op === "load") {
      const value = readValue(context, a, b);
      if (value === undefined) throw new ExpressionError("MISSING_VALUE", `No value supplied for entity ${JSON.stringify(b)}.`, "");
      stack.push(Number(value));
    } else if (op === "neg") stack.push(-stack.pop());
    else if (op === "pos") stack.push(+stack.pop());
    else if (op === "binary") {
      const right = stack.pop(), left = stack.pop();
      if (a === "+") stack.push(left + right);
      else if (a === "-") stack.push(left - right);
      else if (a === "*") stack.push(left * right);
      else if (a === "/") stack.push(left / right);
      else if (a === "%") stack.push(left % right);
      else if (a === "^") stack.push(left ** right);
      else throw new TypeError(`Unknown binary operation ${a}.`);
    } else if (op === "call") {
      const args = stack.splice(stack.length - count, count);
      if (a === "math") stack.push(MATH_FUNCTIONS[b].fn(...args));
      else if (a === "helper") {
        const helper = context.helpers instanceof Map ? context.helpers.get(b) : context.helpers?.[b];
        if (!helper) throw new ExpressionError("MISSING_HELPER", `No bytecode supplied for helper ${JSON.stringify(b)}.`, "");
        // Helpers currently have the scientific-model signature helper(t).
        // Passing the argument as time keeps helper bytecode source-free.
        stack.push(evaluateBytecode(helper, { ...context, time: args[0] ?? context.time }, options));
      } else throw new TypeError(`Unknown call target ${a}.`);
    } else throw new TypeError(`Unknown bytecode operation ${op}.`);
    const top = stack[stack.length - 1];
    if (top !== undefined && !Number.isFinite(top) && options.allowNonFinite !== true) {
      throw new ExpressionError("NON_FINITE_RESULT", "Expression evaluated to a non-finite value.", "");
    }
  }
  if (stack.length !== 1) throw new TypeError("Invalid expression bytecode stack shape.");
  return stack[0];
}
