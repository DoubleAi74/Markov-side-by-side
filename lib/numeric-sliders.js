const ASSIGNMENT =
  /^(\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(\s*)$/i;

export function parseNumericAssignment(text) {
  const match = String(text ?? "").match(ASSIGNMENT);
  if (!match || !Number.isFinite(Number(match[3]))) return null;
  return {
    name: match[2],
    value: Number(match[3]),
    prefix: match[1],
    suffix: match[4],
  };
}

export function replaceAssignmentValue(text, value) {
  const assignment = parseNumericAssignment(text);
  if (!assignment || !Number.isFinite(Number(value))) return text;
  return `${assignment.prefix}${Number(value)}${assignment.suffix}`;
}

export function defaultSliderConfig(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  const doubled = Number.isFinite(number * 2) ? number * 2 : number;
  const min = number < 0 ? doubled : 0;
  const max = number > 0 ? doubled : number === 0 ? 1 : 0;
  const step = Number(((max - min) / 100).toPrecision(12)) || Number.MIN_VALUE;
  return { enabled: true, min, max, step };
}

export function normalizeSliderConfig(config, label = "Slider") {
  if (config == null) return undefined;
  if (typeof config !== "object" || Array.isArray(config))
    throw new Error(`${label} must be an object.`);
  const values = {};
  for (const field of ["min", "max", "step"]) {
    const value = config[field];
    if (
      (typeof value !== "string" && typeof value !== "number") ||
      String(value).trim() === "" ||
      !Number.isFinite(Number(value))
    ) {
      throw new Error(`${label} ${field} must be a finite number.`);
    }
    values[field] = Number(value);
  }
  if (values.max <= values.min || !Number.isFinite(values.max - values.min))
    throw new Error(
      `${label}: maximum must be greater than minimum, with a finite range.`,
    );
  if (values.step <= 0 || values.step > values.max - values.min)
    throw new Error(
      `${label}: step must be positive and no larger than the range.`,
    );
  return { enabled: Boolean(config.enabled), ...values };
}
