const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COMMENT_PREFIXES = ["#", "//"];

function toLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((raw, index) => ({ raw, lineNo: index + 1 }))
    .map(({ raw, lineNo }) => ({ text: raw.trim(), lineNo }))
    .filter(
      ({ text }) =>
        text.length > 0 &&
        !COMMENT_PREFIXES.some((prefix) => text.startsWith(prefix)),
    );
}

function parseFiniteNumber(value, context) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${context}: expected a finite number, got "${value}".`);
  }
  return numeric;
}

function assertUniqueName(name, seen, context) {
  if (seen.has(name)) {
    throw new Error(`${context}: duplicate symbol "${name}".`);
  }
  seen.add(name);
}

export function parseNameValueLines(text, contextLabel) {
  const seen = new Set();
  return toLines(text).map(({ text: line, lineNo }) => {
    const match = line.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i,
    );
    if (!match) {
      throw new Error(
        `${contextLabel} line ${lineNo}: expected "name = number".`,
      );
    }

    const [, name, value] = match;
    assertUniqueName(name, seen, `${contextLabel} line ${lineNo}`);
    return {
      name,
      val: parseFiniteNumber(value, `${contextLabel} line ${lineNo}`),
    };
  });
}

function parseNamedChangeToken(token, varNames) {
  const match = token.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:[:=]\s*)?([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i,
  );
  if (!match) return null;

  let [, rawName, deltaValue] = match;
  let idx = varNames.indexOf(rawName);
  if (idx < 0 && rawName.startsWith("d")) {
    const stripped = rawName.slice(1);
    idx = varNames.indexOf(stripped);
    if (idx >= 0) rawName = stripped;
  }

  if (idx < 0) {
    throw new Error(`Unknown variable "${rawName}" in change segment "${token}".`);
  }

  return { idx, delta: parseFiniteNumber(deltaValue, "Transition change") };
}

function parseChangeSpec(changeText, varNames, contextLine) {
  const chunks = changeText
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    throw new Error(`${contextLine}: missing change vector after "->".`);
  }

  const maybeNamed = chunks.some((chunk) => /[A-Za-z_]/.test(chunk));
  const vector = new Array(varNames.length).fill(0);

  if (!maybeNamed) {
    if (chunks.length > varNames.length) {
      throw new Error(
        `${contextLine}: change has ${chunks.length} entries for ${varNames.length} variables.`,
      );
    }
    chunks.forEach((chunk, i) => {
      vector[i] = parseFiniteNumber(chunk, `${contextLine} change`);
    });
    return vector;
  }

  chunks.forEach((chunk) => {
    const named = parseNamedChangeToken(chunk, varNames);
    if (!named) {
      throw new Error(
        `${contextLine}: invalid named change "${chunk}". Use "X:-1, Y:+1".`,
      );
    }
    vector[named.idx] += named.delta;
  });

  return vector;
}

export function parseTransitionLines(text, varNames, contextLabel = "Transition") {
  const lines = toLines(text);
  return lines.map(({ text: line, lineNo }) => {
    const arrowIdx = line.indexOf("->");
    if (arrowIdx < 0) {
      throw new Error(
        `${contextLabel} line ${lineNo}: expected "rate -> change".`,
      );
    }
    const rate = line.slice(0, arrowIdx).trim();
    const changeSpec = line.slice(arrowIdx + 2).trim();
    if (!rate) {
      throw new Error(`${contextLabel} line ${lineNo}: missing rate expression.`);
    }
    return {
      rate,
      change: changeSpec,
      updateVector: parseChangeSpec(
        changeSpec,
        varNames,
        `${contextLabel} line ${lineNo}`,
      ),
    };
  });
}

export function parseHelperLines(text) {
  const seen = new Set();
  return toLines(text).map(({ text: line, lineNo }) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*t\s*\)\s*=\s*(.+)$/);
    if (!match) {
      throw new Error(
        `Time function line ${lineNo}: expected "Name(t) = expression".`,
      );
    }

    const [, name, body] = match;
    if (!NAME_PATTERN.test(name)) {
      throw new Error(`Time function line ${lineNo}: invalid function name "${name}".`);
    }
    assertUniqueName(name, seen, `Time function line ${lineNo}`);
    if (!body.trim()) {
      throw new Error(`Time function line ${lineNo}: function body is empty.`);
    }
    return { name, body: body.trim() };
  });
}

export function parseSDEComponentLines(text) {
  const seen = new Set();
  return toLines(text).map(({ text: line, lineNo }) => {
    const firstPipe = line.indexOf("|");
    const secondPipe = firstPipe >= 0 ? line.indexOf("|", firstPipe + 1) : -1;
    if (firstPipe < 0 || secondPipe < 0) {
      throw new Error(
        `SDE line ${lineNo}: expected "X = init | drift | diffusion".`,
      );
    }

    const lhs = line.slice(0, firstPipe).trim();
    const drift = line.slice(firstPipe + 1, secondPipe).trim();
    const diff = line.slice(secondPipe + 1).trim();
    const lhsMatch = lhs.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!lhsMatch) {
      throw new Error(
        `SDE line ${lineNo}: left side must be "Variable = initialValue".`,
      );
    }

    const [, name, init] = lhsMatch;
    assertUniqueName(name, seen, `SDE line ${lineNo}`);

    if (!drift || !diff) {
      throw new Error(
        `SDE line ${lineNo}: drift and diffusion expressions are both required.`,
      );
    }

    return {
      name,
      init: parseFiniteNumber(init, `SDE line ${lineNo}`),
      drift,
      diff,
    };
  });
}

export function assignmentsToText(items) {
  return items.map((item) => `${item.name} = ${item.val}`).join("\n");
}

export function transitionsToText(items) {
  return items.map((item) => `${item.rate} -> ${item.change}`).join("\n");
}

export function helpersToText(items) {
  return items.map((item) => `${item.name}(t) = ${item.body}`).join("\n");
}

export function sdeComponentsToText(items) {
  return items
    .map((item) => `${item.name} = ${item.init} | ${item.drift} | ${item.diff}`)
    .join("\n");
}
