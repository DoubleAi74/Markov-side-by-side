"use client";

/**
 * Generates a tiny blur placeholder from a drawable source.
 * Reuses the same downsample-and-encode approach as the original helper below.
 * @param {CanvasImageSource & { width?: number, height?: number, naturalWidth?: number, naturalHeight?: number }} source
 * @param {{ blurWidth?: number, mimeType?: string, quality?: number }} options
 * @returns {string|null} Base64 data URL of the blur
 */
export const generateBlurDataURLFromDrawable = (
  source,
  {
    blurWidth = 200,
    mimeType = "image/jpeg",
    quality = 0.6,
  } = {},
) => {
  const sourceWidth = source?.naturalWidth || source?.width || 0;
  const sourceHeight = source?.naturalHeight || source?.height || 0;
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const aspectRatio = sourceHeight / sourceWidth;
  const targetBlurWidth = blurWidth;
  const blurHeight = Math.max(1, Math.round(targetBlurWidth * aspectRatio));

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = targetBlurWidth;
  blurCanvas.height = blurHeight;

  const blurCtx = blurCanvas.getContext("2d");
  if (!blurCtx) {
    return null;
  }

  blurCtx.drawImage(source, 0, 0, targetBlurWidth, blurHeight);
  return blurCanvas.toDataURL(mimeType, quality);
};

/**
 * Generates a tiny blur placeholder from an image element
 * @param {HTMLImageElement} img - The loaded image
 * @returns {string|null} Base64 data URL of the blur
 */
const generateBlurDataURL = (img) =>
  generateBlurDataURLFromDrawable(img, {
    blurWidth: 200,
    mimeType: "image/jpeg",
    quality: 0.6,
  });

/**
 * Check if file is HEIC/HEIF format
 * @param {File} file
 * @returns {boolean}
 */
const isHeicFile = (file) => {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
};

/**
 * Try to load an image and see if the browser can decode it natively
 * @param {File} file
 * @returns {Promise<HTMLImageElement|null>}
 */
const tryNativeLoad = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Check if image actually loaded with dimensions (not a broken decode)
        if (img.width > 0 && img.height > 0) {
          console.log("[processImage] Native decode succeeded");
          resolve(img);
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = event.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

/**
 * Process the image once we have a decoded HTMLImageElement
 * @param {HTMLImageElement} img
 * @param {File} originalFile
 * @returns {Promise<{file: File, blurDataURL: string}>}
 */
const processLoadedImage = (img, originalFile) => {
  return new Promise((resolve) => {
    try {
      // Generate blur FIRST
      const blurDataURL = generateBlurDataURL(img);
      console.log("[processImage] Blur generated, length:", blurDataURL.length);

      let width = img.width;
      let height = img.height;
      const maxEdge = 2400;

      const needsResize = width > maxEdge || height > maxEdge;

      if (needsResize) {
        if (width > height) {
          height = Math.round((height * maxEdge) / width);
          width = maxEdge;
        } else {
          width = Math.round((width * maxEdge) / height);
          height = maxEdge;
        }
        console.log("[processImage] Resizing to:", width, "x", height);
      } else {
        console.log("[processImage] No resize needed");
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      console.log("[processImage] Drawing to canvas succeeded");

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.warn("[processImage] toBlob returned null");
            resolve({ file: originalFile, blurDataURL });
            return;
          }

          console.log(
            "[processImage] JPEG conversion succeeded, size:",
            Math.round(blob.size / 1024),
            "KB",
          );

          const newName = originalFile.name.replace(/\.[^/.]+$/, "") + ".jpg";

          const jpegFile = new File([blob], newName, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });

          resolve({ file: jpegFile, blurDataURL });
        },
        "image/jpeg",
        0.9,
      );
    } catch (err) {
      console.warn("[processImage] Canvas processing failed:", err);
      resolve({ file: originalFile, blurDataURL: null });
    }
  });
};

/**
 * Processes an image file: resizes if needed and generates a blur placeholder
 * For HEIC files that can't be decoded client-side, returns a flag indicating server processing is needed
 *
 * @param {File} file - The raw file from input
 * @returns {Promise<{file: File, blurDataURL: string|null, needsServerBlur: boolean}>}
 */
export const processImage = async (file) => {
  console.log("[processImage] Start:", file.name, file.type);

  // Try native browser decode first (works for Safari with HEIC, and all standard formats)
  const nativeImg = await tryNativeLoad(file);

  if (nativeImg) {
    console.log("[processImage] Using native decode path");
    const result = await processLoadedImage(nativeImg, file);
    return { ...result, needsServerBlur: false };
  }

  // If native decode failed and it's HEIC, flag for server-side processing
  if (isHeicFile(file)) {
    console.log(
      "[processImage] HEIC detected, needs server-side blur generation",
    );
    return {
      file,
      blurDataURL: null,
      needsServerBlur: true,
    };
  }

  // For other formats that failed to decode, return as-is
  console.warn(
    "[processImage] Decode failed for non-HEIC file, returning original",
  );
  return { file, blurDataURL: null, needsServerBlur: false };
};

/**
 * Fetches blur from server after image has been uploaded
 * Uses retry with delay to handle CDN propagation delays
 * @param {string} imageUrl - The uploaded image URL
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<string|null>} - The blur data URL or null on failure
 */
export const fetchServerBlur = async (imageUrl, maxRetries = 5) => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[fetchServerBlur] Attempt ${attempt}/${maxRetries} for:`,
        imageUrl,
      );
      const res = await fetch("/api/generate-blur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });

      if (res.ok) {
        const { blurDataURL } = await res.json();
        console.log("[fetchServerBlur] Success, length:", blurDataURL?.length);
        return blurDataURL;
      }

      console.warn(`[fetchServerBlur] Attempt ${attempt} failed:`, res.status);

      // If not the last attempt, wait before retrying
      // Increasing delay: 1s, 2s, 3s
      if (attempt < maxRetries) {
        const waitTime = attempt * 1000;
        console.log(`[fetchServerBlur] Waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
      }
    } catch (err) {
      console.warn(`[fetchServerBlur] Attempt ${attempt} error:`, err.message);

      // If not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const waitTime = attempt * 1000;
        console.log(`[fetchServerBlur] Waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
      }
    }
  }

  console.error("[fetchServerBlur] All attempts failed");
  return null;
};
