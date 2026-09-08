import {
  parseBase64ImageDataUrl,
  parseOptionalBlurDataUrl,
} from "@/lib/images/base64";
import { MAX_BLUR_DATA_URL_LENGTH } from "@/lib/previews/limits";
import {
  MAX_PROFILE_IMAGE_BYTES,
  PROFILE_IMAGE_MIME_TYPES,
  PROFILE_IMAGE_SIZE,
} from "@/lib/community/profile";

export class CommunityValidationError extends Error {}

const fail = (message) => new CommunityValidationError(message);

export function validateProfileImageUploadInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw fail("Request body must be an object.");
  }

  const image = parseBase64ImageDataUrl(input.imageDataUrl, "imageDataUrl", {
    allowedMimeTypes: PROFILE_IMAGE_MIME_TYPES,
    maxBytes: MAX_PROFILE_IMAGE_BYTES,
    fail,
  });

  const blurDataURL = parseOptionalBlurDataUrl(
    input.blurDataURL,
    "blurDataURL",
    { maxLength: MAX_BLUR_DATA_URL_LENGTH, fail },
  );

  // Dimensions are fixed server-side rather than trusted from the client; the
  // browser encoder always produces a square at PROFILE_IMAGE_SIZE.
  return {
    image,
    blurDataURL,
    width: PROFILE_IMAGE_SIZE,
    height: PROFILE_IMAGE_SIZE,
    format: image.mimeType,
    fileSize: image.buffer.length,
  };
}

export function validateCommunityVisibilityInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw fail("Request body must be an object.");
  }

  if (typeof input.hidden !== "boolean") {
    throw fail("hidden must be a boolean.");
  }

  return { hidden: input.hidden };
}
