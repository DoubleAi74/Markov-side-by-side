import { spawn } from "node:child_process";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { chromium } from "@playwright/test";

const url = "http://127.0.0.1:3100/";
const deadline = (promise, timeoutMs, message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});
const server = spawn("npm", ["run", "start", "--", "--port", "3100"], {
  env: {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "markov-lab-lighthouse-secret-do-not-use-outside-tests",
    AUTH_TRUST_HOST: "true",
    MARKOV_LAB_E2E: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`Next.js exited before Lighthouse started.\n${serverOutput}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js was not ready within ${timeoutMs} ms.\n${serverOutput}`);
}

let chrome;
try {
  await waitForServer();
  chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });
  const result = await deadline(lighthouse(url, {
    port: chrome.port,
    logLevel: "info",
    output: "json",
    onlyCategories: ["performance", "accessibility"],
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 412, height: 915, deviceScaleFactor: 2, disabled: false },
    throttlingMethod: "simulate",
  }), 120_000, "Lighthouse did not finish within 120 seconds.");
  const performance = Math.round((result?.lhr?.categories?.performance?.score ?? 0) * 100);
  const accessibility = Math.round((result?.lhr?.categories?.accessibility?.score ?? 0) * 100);
  console.log(`Lighthouse mobile: Performance ${performance}, Accessibility ${accessibility}`);
  if (performance < 90 || accessibility < 95) {
    throw new Error(`Lighthouse gate failed: require Performance >= 90 and Accessibility >= 95; received ${performance} and ${accessibility}.`);
  }
} finally {
  if (chrome) await deadline(chrome.kill(), 5_000, "Chrome cleanup timed out.").catch(() => {});
  if (server.exitCode == null) server.kill("SIGTERM");
  server.stdout.destroy();
  server.stderr.destroy();
  server.unref();
}
