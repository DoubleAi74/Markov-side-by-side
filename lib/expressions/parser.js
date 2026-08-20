import { ExpressionError } from "./errors.js";
import { lexExpression } from "./lexer.js";

const PRECEDENCE = { "+": 10, "-": 10, "*": 20, "/": 20, "%": 20, "^": 30 };

export function parseExpression(source, limits = {}) {
  const tokens = lexExpression(source, limits);
  const maxDepth = limits.maxDepth ?? 128;
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  const fail = (code, message, token = peek()) => {
    throw new ExpressionError(code, message, String(source ?? ""), token.start, token.end);
  };

  function primary(depth) {
    if (depth > maxDepth) fail("EXPRESSION_TOO_DEEP", `Expression nesting exceeds ${maxDepth}.`);
    const token = take();
    if (token.type === "number") return { type: "Literal", value: token.value, range: { start: token.start, end: token.end } };
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      // Exponentiation binds more tightly than unary signs: -2^2 is -(2^2).
      const argument = binary(25, depth + 1);
      return { type: "UnaryExpression", operator: token.value, argument, range: { start: token.start, end: argument.range.end } };
    }
    if (token.type === "identifier") {
      if (peek().type !== "(") return { type: "Identifier", name: token.value, range: { start: token.start, end: token.end } };
      take();
      const args = [];
      if (peek().type !== ")") {
        while (true) {
          args.push(binary(0, depth + 1));
          if (peek().type !== ",") break;
          take();
        }
      }
      if (peek().type !== ")") fail("EXPECTED_RPAREN", "Expected closing parenthesis.");
      const close = take();
      return { type: "CallExpression", callee: token.value, arguments: args, range: { start: token.start, end: close.end }, calleeRange: { start: token.start, end: token.end } };
    }
    if (token.type === "(") {
      const expression = binary(0, depth + 1);
      if (peek().type !== ")") fail("EXPECTED_RPAREN", "Expected closing parenthesis.");
      const close = take();
      expression.range = { start: token.start, end: close.end };
      return expression;
    }
    fail("EXPECTED_EXPRESSION", "Expected a number, symbol, or parenthesised expression.", token);
  }

  function binary(minPrecedence, depth) {
    let left = primary(depth);
    while (peek().type === "operator" && PRECEDENCE[peek().value] >= minPrecedence) {
      const operator = take();
      const precedence = PRECEDENCE[operator.value];
      const right = binary(precedence + (operator.value === "^" ? 0 : 1), depth + 1);
      left = { type: "BinaryExpression", operator: operator.value, left, right, range: { start: left.range.start, end: right.range.end } };
    }
    return left;
  }

  if (peek().type === "eof") fail("EMPTY_EXPRESSION", "Expression is empty.");
  const ast = binary(0, 0);
  if (peek().type !== "eof") fail("UNEXPECTED_TOKEN", `Unexpected token ${JSON.stringify(peek().value)}.`);
  return ast;
}
