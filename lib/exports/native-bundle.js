import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createModelExportConfig,
  getModelExportConfigFilename,
  stringifyModelExportConfig,
} from "@/lib/exports/config";
import { createStoredZip } from "@/lib/exports/zip";

const NATIVE_TEMPLATE_DIRECTORY = path.join(
  process.cwd(),
  "templates",
  "native",
);

async function readNativeTemplate(filename) {
  return readFile(path.join(NATIVE_TEMPLATE_DIRECTORY, filename));
}

export async function createNativeBundle(savedSimulation) {
  const config = createModelExportConfig(savedSimulation);
  const configBuffer = Buffer.from(stringifyModelExportConfig(config), "utf8");
  const [cppRunner, pythonWrapper, pythonUi, readme] = await Promise.all([
    readNativeTemplate("markov_native_runner.cpp"),
    readNativeTemplate("run_markov_native.py"),
    readNativeTemplate("run_markov_native_ui.py"),
    readNativeTemplate("README_NATIVE.md"),
  ]);

  return createStoredZip([
    {
      name: getModelExportConfigFilename(savedSimulation),
      data: configBuffer,
    },
    {
      name: "markov_native_runner.cpp",
      data: cppRunner,
    },
    {
      name: "run_markov_native.py",
      data: pythonWrapper,
    },
    {
      name: "run_markov_native_ui.py",
      data: pythonUi,
    },
    {
      name: "README_NATIVE.md",
      data: readme,
    },
  ]);
}
