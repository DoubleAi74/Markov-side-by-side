import bcrypt from "bcryptjs";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const BCRYPT_ROUNDS = 12;

export class AuthInputError extends Error {}
export class AuthConflictError extends Error {}

function assert(condition, message) {
  if (!condition) {
    throw new AuthInputError(message);
  }
}

export function normalizeEmail(value) {
  assert(typeof value === "string", "Email is required.");
  const normalized = value.trim().toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized), "Enter a valid email address.");
  return normalized;
}

export function normalizePassword(value) {
  assert(typeof value === "string", "Password is required.");
  assert(
    value.length >= MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  );
  assert(
    value.length <= MAX_PASSWORD_LENGTH,
    `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
  );
  return value;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  if (typeof password !== "string" || typeof passwordHash !== "string") {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
