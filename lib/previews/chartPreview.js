import { generateBlurDataURLFromDrawable } from "@/example_blur64";
import {
  Chart,
  buildSimulationChartConfig,
} from "@/components/simulators/shared/chartConfig";

const INTERNAL_WIDTH = 800;
const INTERNAL_HEIGHT = 600;
const OUTPUT_WIDTH = 400;
const OUTPUT_HEIGHT = 300;
const OUTPUT_FORMAT = "image/webp";
const OUTPUT_QUALITY = 0.82;
const FALLBACK_FORMAT = "image/jpeg";
const FALLBACK_QUALITY = 0.86;

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read preview blob."));
    reader.readAsDataURL(blob);
  });
}

function paintWhiteBackground(ctx, width, height) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

async function encodePreviewCanvas(canvas) {
  let blob = await canvasToBlob(canvas, OUTPUT_FORMAT, OUTPUT_QUALITY);

  if (!blob) {
    blob = await canvasToBlob(canvas, FALLBACK_FORMAT, FALLBACK_QUALITY);
  }

  if (!blob) {
    throw new Error("Failed to encode chart preview.");
  }

  const dataUrl = await blobToDataURL(blob);
  if (typeof dataUrl !== "string") {
    throw new Error("Failed to serialize chart preview.");
  }

  return {
    dataUrl,
    fileSize: blob.size,
  };
}

export async function generateSavedSimulationChartPreview(chartInput) {
  const renderCanvas = createCanvas(INTERNAL_WIDTH, INTERNAL_HEIGHT);
  const renderContext = renderCanvas.getContext("2d");
  if (!renderContext) {
    throw new Error("Failed to create preview canvas context.");
  }

  const chart = new Chart(
    renderContext,
    buildSimulationChartConfig({
      ...chartInput,
      responsive: false,
      showTooltips: false,
      devicePixelRatio: 1,
      layoutPadding: {
        top: 20,
        right: 20,
        bottom: 20,
        left: 20,
      },
    }),
  );

  try {
    chart.resize(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    chart.update("none");
    await waitForPaint();

    const outputCanvas = createCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) {
      throw new Error("Failed to create final preview canvas context.");
    }

    paintWhiteBackground(outputContext, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(
      renderCanvas,
      0,
      0,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
      0,
      0,
      OUTPUT_WIDTH,
      OUTPUT_HEIGHT,
    );

    return {
      ...(await encodePreviewCanvas(outputCanvas)),
      blurDataURL: generateBlurDataURLFromDrawable(outputCanvas, {
        blurWidth: 24,
        mimeType: "image/jpeg",
        quality: 0.55,
      }),
    };
  } finally {
    chart.destroy();
  }
}
