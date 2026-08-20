import { NextResponse } from "next/server";
import { getNativeBundleFilename } from "@/lib/exports/config";
import { createNativeBundle } from "@/lib/exports/native-bundle";
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

    const bundle = await createNativeBundle(publicModel.savedSimulation);
    return new NextResponse(bundle, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${getNativeBundleFilename(publicModel.savedSimulation)}"`,
        "Cache-Control": "public, max-age=0, s-maxage=60",
      },
    });
  } catch (error) {
    return internalErrorResponse(error, "Failed to export public native bundle.");
  }
}
