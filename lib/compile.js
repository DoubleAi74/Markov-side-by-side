// Shared expression compiler used by all three simulators.
// Transforms user-typed math strings like "k * Prey * Pred"
// into JS functions via new Function().

const MATH_PROPS = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'exp', 'log', 'sqrt', 'abs', 'pow',
  'PI', 'E', 'random', 'floor', 'ceil', 'max', 'min',
];

function substituteMath(expr) {
  let s = expr;
  MATH_PROPS.forEach((p) => {
    s = s.replace(new RegExp(`\\b${p}\\b`, 'g'), `Math.${p}`);
  });
  return s;
}

/**
 * Compiles a math expression string into a rate function f(state, t, params).
 *
 * @param {string} expr        - User-typed expression, e.g. "k * Prey"
 * @param {string[]} varNames  - Ordered variable names → mapped to s[i]
 * @param {string[]} paramNames- Parameter names → mapped to p['name']
 * @param {string} helperBlock - Optional pre-built JS helper function declarations
 *                               (used by CTMP-inhomo time functions)
 * @returns {Function} (s, t, p) => number
 */
export function compileExpression(expr, varNames, paramNames, helperBlock = '') {
  if (!expr || !expr.trim()) return () => 0;

  let jsExpr = expr.trim();

  // Replace "time" alias with "t"
  jsExpr = jsExpr.replace(/\btime\b/g, 't');

  // Apply math substitutions first
  jsExpr = substituteMath(jsExpr);

  // Replace variables (sort longest-first to avoid substring collisions)
  [...varNames]
    .map((n, i) => ({ name: n, idx: i }))
    .sort((a, b) => b.name.length - a.name.length)
    .forEach(({ name, idx }) => {
      if (!name) return;
      jsExpr = jsExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), `s[${idx}]`);
    });

  // Replace params (sort longest-first)
  [...paramNames]
    .sort((a, b) => b.length - a.length)
    .forEach((name) => {
      if (!name) return;
      jsExpr = jsExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), `p['${name}']`);
    });

  try {
    // helperBlock contains pre-declared helper functions (e.g. "function Season(t) { ... }")
    return new Function('s', 't', 'p', `${helperBlock}\nreturn ${jsExpr};`);
  } catch (e) {
    throw new Error(`Syntax error in expression "${expr}": ${e.message}`);
  }
}

/**
 * Builds a helper-block string from an array of { name, body } objects.
 * Each helper is a function of t, with params available.
 * Used by the CTMP-inhomo "Time Functions" feature.
 *
 * @param {{ name: string, body: string }[]} helpers
 * @param {string[]} paramNames
 * @returns {string}
 */
export function buildHelperBlock(helpers, paramNames) {
  return helpers
    .filter((h) => h.name && h.body)
    .map((h) => {
      let body = h.body.trim();
      body = substituteMath(body);
      [...paramNames]
        .sort((a, b) => b.length - a.length)
        .forEach((name) => {
          if (!name) return;
          body = body.replace(new RegExp(`\\b${name}\\b`, 'g'), `p['${name}']`);
        });
      return `function ${h.name}(t) { return ${body}; }`;
    })
    .join('\n');
}
