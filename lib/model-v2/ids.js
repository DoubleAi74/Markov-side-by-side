const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEntityId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// Deterministic UUID-shaped IDs make dry-runs and repeated v1 migrations identical.
export function deterministicEntityId(namespace, kind, index, name = "") {
  const input = `${namespace}\u001f${kind}\u001f${index}\u001f${name}`;
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const x = input.charCodeAt(i);
    a = Math.imul(a ^ x, 0x85ebca6b); b = Math.imul(b + x, 0xc2b2ae35);
    c = Math.imul(c ^ (x << (i & 7)), 0x27d4eb2d); d = Math.imul(d + (x ^ i), 0x165667b1);
    a ^= a >>> 13; b ^= b >>> 16; c ^= c >>> 15; d ^= d >>> 13;
  }
  const bytes = [];
  for (const word of [a, b, c, d]) for (let shift = 24; shift >= 0; shift -= 8) bytes.push((word >>> shift) & 255);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newEntityId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure randomness is unavailable.");
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
