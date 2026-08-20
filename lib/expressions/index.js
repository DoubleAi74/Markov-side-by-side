import { parseExpression } from "./parser.js";
import { resolveExpression } from "./resolver.js";
import { compileBytecode, evaluateBytecode } from "./bytecode.js";

export { ExpressionError } from "./errors.js";
export { lexExpression } from "./lexer.js";
export { parseExpression } from "./parser.js";
export { resolveExpression, MATH_FUNCTIONS, CONSTANTS, RESERVED_SYMBOL_NAMES } from "./resolver.js";
export { compileBytecode, evaluateBytecode, BYTECODE_VERSION } from "./bytecode.js";

export function compileExpressionSafe(source, symbols = [], helpers = [], limits) {
  return compileBytecode(resolveExpression(parseExpression(source, limits), symbols, helpers));
}

export function createExpressionEvaluator(source, symbols = [], helpers = [], limits) {
  const bytecode = compileExpressionSafe(source, symbols, helpers, limits);
  return Object.assign((context) => evaluateBytecode(bytecode, context), { bytecode });
}
