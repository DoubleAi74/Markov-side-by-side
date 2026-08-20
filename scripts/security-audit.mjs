import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["app", "components", "lib", "models"];
const FORBIDDEN = [
  { label: "dynamic Function constructor", pattern: /\bnew\s+Function\s*\(/g },
  { label: "direct eval", pattern: /\beval\s*\(/g },
];

async function filesBelow(relativeDirectory) {
  const absoluteDirectory = path.join(ROOT, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(relative)));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(relative);
  }
  return files;
}

const violations = [];
for (const sourceRoot of SOURCE_ROOTS) {
  for (const relative of await filesBelow(sourceRoot)) {
    const source = await readFile(path.join(ROOT, relative), "utf8");
    for (const forbidden of FORBIDDEN) {
      for (const match of source.matchAll(forbidden.pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${relative}:${line}: ${forbidden.label}`);
      }
    }
  }
}

if (violations.length) {
  console.error("Unsafe execution primitives found:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Security audit passed: no eval or Function constructor in runtime source.");
}
