import { generateCsvText } from "./csv.js";

const jobs = new Map();

self.onmessage = async ({ data }) => {
  if (data?.type === "cancel") {
    jobs.get(data.jobId)?.abort();
    return;
  }
  if (data?.type !== "export") return;
  const controller = new AbortController();
  jobs.set(data.jobId, controller);
  try {
    const csv = await generateCsvText({
      runs: data.runs,
      variableNames: data.variableNames,
      signal: controller.signal,
      onProgress: (progress) => self.postMessage({ type: "progress", jobId: data.jobId, ...progress }),
    });
    self.postMessage({ type: "complete", jobId: data.jobId, blob: new Blob([csv], { type: "text/csv;charset=utf-8" }) });
  } catch (error) {
    self.postMessage({ type: error.code === "CANCELLED" ? "cancelled" : "error", jobId: data.jobId, error: { code: error.code, message: error.message } });
  } finally {
    jobs.delete(data.jobId);
  }
};
