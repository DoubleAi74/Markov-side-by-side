// Shared expression compiler used by the expression-based simulators.
// Transforms user-typed math strings like "k * Prey * Pred"
// into JS functions via new Function().

const MATH_PROPS = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'exp', 'log', 'sqrt', 'abs', 'pow',
  'PI', 'E', 'random', 'floor', 'ceil', 'max', 'min',
];
const MATH_PROP_SET = new Set(MATH_PROPS);

function substituteIdentifiers(expr, varNames = [], paramNames = []) {
  const variableIndex = new Map(
    varNames.flatMap((name, index) => (name ? [[name, index]] : [])),
  );
  const parameterNames = new Set(paramNames.filter(Boolean));

  return expr.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (name) => {
    if (name === 'time') return 't';
    if (MATH_PROP_SET.has(name)) return `Math.${name}`;
    if (variableIndex.has(name)) return `s[${variableIndex.get(name)}]`;
    if (parameterNames.has(name)) return `p[${JSON.stringify(name)}]`;
    return name;
  });
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

  // Replace ^ with ** for exponentiation
  jsExpr = jsExpr.replace(/\^/g, '**');

  // Rewrite each identifier exactly once so short parameter names cannot
  // modify generated lookups such as p["binomial"].
  jsExpr = substituteIdentifiers(jsExpr, varNames, paramNames);

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
      body = substituteIdentifiers(body, [], paramNames);
      return `function ${h.name}(t) { return ${body}; }`;
    })
    .join('\n');
}
