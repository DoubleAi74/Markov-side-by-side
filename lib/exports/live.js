import "server-only";
import {
  createModelExportConfig,
  getModelExportConfigFilename,
  getNativeBundleFilename,
  stringifyModelExportConfig,
} from "@/lib/exports/config";
import { createNativeBundle } from "@/lib/exports/native-bundle";
import { validateLiveExportInput } from "@/lib/saved-simulations/validators";

function toExportSimulation(input) {
  return {
    name: input.name,
    description: input.description ?? "",
    simulatorType: input.simulatorType,
    payload: input.payload,
  };
}

export function createLiveConfigExport(body) {
  const simulation = toExportSimulation(validateLiveExportInput(body));
  return {
    filename: getModelExportConfigFilename(simulation),
    body: stringifyModelExportConfig(createModelExportConfig(simulation)),
  };
}

export async function createLiveNativeBundleExport(body) {
  const simulation = toExportSimulation(validateLiveExportInput(body));
  return {
    filename: getNativeBundleFilename(simulation),
    body: await createNativeBundle(simulation),
  };
}
