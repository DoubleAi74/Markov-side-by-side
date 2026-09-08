"use client";

import { generateBlurDataURLFromDrawable } from "@/example_blur64";
import { MAX_BLUR_DATA_URL_LENGTH } from "@/lib/previews/limits";
import {
  MAX_PROFILE_IMAGE_BYTES,
  PROFILE_IMAGE_SIZE,
} from "@/lib/community/profile";

const OUTPUT_FORMAT = "image/webp";
const FALLBACK_FORMAT = "image/jpeg";
const QUALITY_LADDER = [0.86, 0.74, 0.62, 0.5];
const BLUR_WIDTH_CANDIDATES = [24, 16, 12, 8];
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_UPLOAD_TYPES =
  "image/png,image/jpeg,image/webp,image/gif,image/avif";

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That file could not be read as an image."));
    };
    image.src = objectUrl;
  });
}

function dataUrlByteLength(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function encodeWithinBudget(canvas) {
  for (const format of [OUTPUT_FORMAT, FALLBACK_FORMAT]) {
    for (const quality of QUALITY_LADDER) {
      const dataUrl = canvas.toDataURL(format, quality);
      // Safari silently falls back to PNG when a format is unsupported.
      if (!dataUrl.startsWith(`data:${format}`)) break;
      if (dataUrlByteLength(dataUrl) <= MAX_PROFILE_IMAGE_BYTES) {
        return dataUrl;
      }
    }
  }
  return null;
}

function boundedBlurDataUrl(canvas) {
  for (const blurWidth of BLUR_WIDTH_CANDIDATES) {
    const blurDataURL = generateBlurDataURLFromDrawable(canvas, {
      blurWidth,
      mimeType: "image/jpeg",
      quality: 0.55,
    });
    if (blurDataURL && blurDataURL.length <= MAX_BLUR_DATA_URL_LENGTH) {
      return blurDataURL;
    }
  }
  return null;
}

/**
 * Turns a picked file into a square, downscaled data URL ready for the upload
 * endpoint. Re-encoding through a canvas also drops EXIF (including any GPS
 * tags) so the original file never leaves the browser.
 */
export async function encodeProfileImage(file) {
  if (!file) {
    throw new Error("Choose an image first.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("That image is too large. Choose one under 20 MB.");
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("That image could not be decoded.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = PROFILE_IMAGE_SIZE;
  canvas.height = PROFILE_IMAGE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Your browser blocked image processing.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  // Centre-crop the longer edge so the square never distorts the picture.
  const side = Math.min(sourceWidth, sourceHeight);
  context.drawImage(
    image,
    (sourceWidth - side) / 2,
    (sourceHeight - side) / 2,
    side,
    side,
    0,
    0,
    PROFILE_IMAGE_SIZE,
    PROFILE_IMAGE_SIZE,
  );

  const imageDataUrl = encodeWithinBudget(canvas);
  if (!imageDataUrl) {
    throw new Error("That image could not be compressed small enough.");
  }

  return { imageDataUrl, blurDataURL: boundedBlurDataUrl(canvas) };
}
