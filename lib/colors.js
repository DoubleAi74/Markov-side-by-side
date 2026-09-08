export function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${[...color.slice(1)].map((digit) => digit + digit).join("")}`;
  }
  return null;
}

export function normalizeColorFields(value) {
  if (value == null) return {};
  const color = normalizeHexColor(value);
  if (!color) throw new Error("Variable colour must be a hex colour, such as #2563eb.");
  return { color };
}
