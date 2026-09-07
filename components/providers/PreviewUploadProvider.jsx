"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { generateSavedSimulationChartPreview } from "@/lib/previews/chartPreview";
import { SAVED_SIMULATION_PREVIEW_UPDATED_EVENT } from "@/lib/previews/events";

const PreviewUploadContext = createContext(null);

function makeJobId() {
  return Math.random().toString(36).slice(2);
}

function clonePreviewChart(chart) {
  if (typeof structuredClone === "function") {
    return structuredClone(chart);
  }

  return JSON.parse(JSON.stringify(chart));
}

export function PreviewUploadProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const processingRef = useRef(false);

  const enqueuePreviewUpload = useCallback((job) => {
    if (!job?.savedSimulationId || !job?.chart) {
      return;
    }

    setQueue((current) => [
      ...current,
      {
        id: makeJobId(),
        ...job,
        chart: clonePreviewChart(job.chart),
      },
    ]);
  }, []);

  useEffect(() => {
    if (processingRef.current || queue.length === 0) {
      return;
    }

    const nextJob = queue[0];
    let cancelled = false;
    processingRef.current = true;

    (async () => {
      try {
        const preview = await generateSavedSimulationChartPreview(nextJob.chart);
        const response = await fetch(
          `/api/saved-simulations/${nextJob.savedSimulationId}/preview`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imageDataUrl: preview.dataUrl,
              blurDataURL: preview.blurDataURL,
            }),
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error || "Failed to upload saved simulation preview.",
          );
        }

        const updated = await response.json();
        if (!cancelled && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(SAVED_SIMULATION_PREVIEW_UPDATED_EVENT, {
              detail: {
                savedSimulation: updated,
              },
            }),
          );
        }
      } catch (error) {
        console.error("[preview-upload]", error);
      } finally {
        processingRef.current = false;
        if (!cancelled) {
          setQueue((current) =>
            current.filter((job) => job.id !== nextJob.id),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queue]);

  return (
    <PreviewUploadContext.Provider value={{ enqueuePreviewUpload }}>
      {children}
    </PreviewUploadContext.Provider>
  );
}

export function usePreviewUploadQueue() {
  const context = useContext(PreviewUploadContext);
  if (!context) {
    throw new Error(
      "usePreviewUploadQueue must be used within PreviewUploadProvider.",
    );
  }
  return context;
}
