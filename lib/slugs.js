const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/g;
const EDGE_DASHES_PATTERN = /^-+|-+$/g;
const MULTIPLE_DASHES_PATTERN = /-+/g;

function normalizeMaxLength(maxLength, fallback = 80) {
  if (!Number.isFinite(maxLength)) {
    return fallback;
  }

  return Math.max(8, Math.floor(maxLength));
}

function truncateSlug(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength).replace(EDGE_DASHES_PATTERN, "");
}

export function normalizeSlug(value, { maxLength = 80 } = {}) {
  if (typeof value !== "string") {
    return "";
  }

  const limit = normalizeMaxLength(maxLength);
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, "-")
    .replace(MULTIPLE_DASHES_PATTERN, "-")
    .replace(EDGE_DASHES_PATTERN, "");

  if (!normalized) {
    return "";
  }

  return truncateSlug(normalized, limit);
}

export function createSlug(value, { fallback = "item", maxLength = 80 } = {}) {
  const normalized = normalizeSlug(value, { maxLength });
  if (normalized) {
    return normalized;
  }

  const fallbackSlug = normalizeSlug(String(fallback ?? ""), { maxLength });
  if (fallbackSlug) {
    return fallbackSlug;
  }

  return "item";
}

export function normalizeUsernameSlug(value) {
  return normalizeSlug(value, { maxLength: 32 });
}

export function createUsernameSlug(value, fallback = "user") {
  return createSlug(value, {
    fallback,
    maxLength: 32,
  });
}

export function normalizeSavedSimulationSlug(value) {
  return normalizeSlug(value, { maxLength: 80 });
}

export function createSavedSimulationSlug(value) {
  return createSlug(value, {
    fallback: "model",
    maxLength: 80,
  });
}

export function withNumericSlugSuffix(baseSlug, suffixIndex, { maxLength = 80 } = {}) {
  const normalizedBase = createSlug(baseSlug, {
    fallback: "item",
    maxLength,
  });

  if (!Number.isFinite(suffixIndex) || suffixIndex <= 1) {
    return normalizedBase;
  }

  const suffix = `-${Math.floor(suffixIndex)}`;
  const availableBaseLength = Math.max(1, normalizeMaxLength(maxLength) - suffix.length);
  const trimmedBase = truncateSlug(normalizedBase, availableBaseLength);
  return `${trimmedBase}${suffix}`;
}
