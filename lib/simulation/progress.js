export function createProgressReporter(callback, intervalMs = 250) {
  if (typeof callback !== "function") return () => {};
  let last = globalThis.performance?.now?.() ?? Date.now();
  return (progress, force = false) => {
    const current = globalThis.performance?.now?.() ?? Date.now();
    if (!force && current - last < intervalMs) return;
    last = current;
    callback(progress);
  };
}
