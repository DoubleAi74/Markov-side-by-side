import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Match the Next.js @/ alias when running shared modules with Node's test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only")
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url);
      if (!existsSync(fileURLToPath(url))) url.pathname += ".js";
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});
