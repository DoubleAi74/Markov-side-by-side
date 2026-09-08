import { Buffer } from "node:buffer";

const DATA_URL_PATTERN = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Parses a base64 image data URL, enforcing a MIME allow-list and byte cap.
 * Shared by the saved-simulation preview and profile-image upload endpoints so
 * both accept exactly the same shape of payload.
 *
 * @throws {Error} via the caller-supplied `fail` when the value is unusable.
 */
export function parseBase64ImageDataUrl(
  value,
  label,
  { allowedMimeTypes, maxBytes, fail },
) {
  const reject = (message) => {
    throw fail(message);
  };

  if (typeof value !== "string") {
    reject(`${label} must be a string.`);
  }

  const normalized = value.trim();
  const match = normalized.match(DATA_URL_PATTERN);
  if (!match) {
    reject(`${label} must be a base64 data URL.`);
  }

  const mimeType = match[1].toLowerCase();
  if (allowedMimeTypes && !allowedMimeTypes.includes(mimeType)) {
    reject(`${label} has an unsupported MIME type.`);
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) {
    reject(`${label} is empty.`);
  }
  if (typeof maxBytes === "number" && buffer.length > maxBytes) {
    reject(`${label} exceeds the maximum size.`);
  }

  return { mimeType, buffer, dataUrl: normalized };
}

/**
 * Validates an optional tiny blur placeholder that ships alongside an image.
 * Returns null when the caller did not send one.
 */
export function parseOptionalBlurDataUrl(value, label, { maxLength, fail }) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw fail(`${label} must be a string.`);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw fail(`${label} exceeds the maximum size.`);
  }
  if (!/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(normalized)) {
    throw fail(`${label} must be a base64 image data URL.`);
  }

  return normalized;
}
