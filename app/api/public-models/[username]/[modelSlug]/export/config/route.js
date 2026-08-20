import { NextResponse } from "next/server";
import {
  createModelExportConfig,
  getModelExportConfigFilename,
  stringifyModelExportConfig,
} from "@/lib/exports/config";
import { getPublicSavedSimulationByUsernameAndSlug } from "@/lib/saved-simulations/service";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const { username, modelSlug } = await params;
    const publicModel = await getPublicSavedSimulationByUsernameAndSlug(
      username,
      modelSlug,
      { includePayload: true },
    );

    if (!publicModel?.savedSimulation) {
      return NextResponse.json(
        { error: "Saved simulation not found." },
        { status: 404 },
      );
    }

    const exportedConfig = createModelExportConfig(publicModel.savedSimulation);
    return new NextResponse(stringifyModelExportConfig(exportedConfig), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${getModelExportConfigFilename(publicModel.savedSimulation)}"`,
        "Cache-Control": "public, max-age=0, s-maxage=60",
      },
    });
  } catch (error) {
    return internalErrorResponse(error, "Failed to export public model config.");
  }
}
