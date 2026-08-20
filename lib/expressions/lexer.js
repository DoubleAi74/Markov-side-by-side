import { ExpressionError } from "./errors.js";

const SINGLE = new Set(["+", "-", "*", "/", "%", "^", "(", ")", ","]);

/** Tokenise the deliberately small Markov Lab expression language. */
export function lexExpression(source, limits = {}) {
  source = String(source ?? "");
  const maxLength = limits.maxLength ?? 16384;
  const maxTokens = limits.maxTokens ?? 4096;
  if (source.length > maxLength) {
    throw new ExpressionError("EXPRESSION_TOO_LARGE", `Expression exceeds ${maxLength} characters.`, source, maxLength, source.length);
  }
  const tokens = [];
  let i = 0;
  const push = (type, value, start, end = i) => {
    tokens.push({ type, value, start, end });
    if (tokens.length > maxTokens) {
      throw new ExpressionError("TOO_MANY_TOKENS", `Expression exceeds ${maxTokens} tokens.`, source, start, end);
    }
  };
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    const start = i;
    if (/[0-9.]/.test(c)) {
      const match = source.slice(i).match(/^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/);
      if (!match) throw new ExpressionError("INVALID_NUMBER", "Invalid numeric literal.", source, start, start + 1);
      i += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new ExpressionError("NON_FINITE_LITERAL", "Numeric literals must be finite.", source, start, i);
      push("number", value, start, i);
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      i++;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
      push("identifier", source.slice(start, i), start, i);
      continue;
    }
    // Accept JavaScript-style exponent spelling for legacy models, but encode it
    // as the language's own exponent operator rather than JavaScript source.
    if (c === "*" && source[i + 1] === "*") {
      i += 2;
      push("operator", "^", start, i);
      continue;
    }
    if (SINGLE.has(c)) {
      i++;
      push(c === "(" || c === ")" || c === "," ? c : "operator", c, start, i);
      continue;
    }
    // Explicitly reject all JavaScript escape hatches, including member access.
    throw new ExpressionError("UNSUPPORTED_TOKEN", `Unsupported token ${JSON.stringify(c)}.`, source, start, start + 1);
  }
  tokens.push({ type: "eof", value: null, start: i, end: i });
  return tokens;
}
