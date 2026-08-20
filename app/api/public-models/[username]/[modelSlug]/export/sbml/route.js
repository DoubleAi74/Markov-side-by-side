import { NextResponse } from "next/server";
import { getPublicSavedSimulationByUsernameAndSlug } from "@/lib/saved-simulations/service";
import { createSBMLExport, SBMLCompatibilityError } from "@/lib/interchange/sbml";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const { username, modelSlug } = await params;
    const result = await getPublicSavedSimulationByUsernameAndSlug(username, modelSlug, { includePayload: true });
    if (!result?.savedSimulation) return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    return new NextResponse(createSBMLExport(result.savedSimulation), {
      headers: {
        "Content-Type": "application/sbml+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.savedSimulation.slug}.xml"`,
        "Cache-Control": "public, max-age=0, s-maxage=60",
      },
    });
  } catch (error) {
    if (error instanceof SBMLCompatibilityError) {
      return NextResponse.json({ error: error.message, compatible: false, issues: error.issues }, { status: 422 });
    }
    return internalErrorResponse(error, "Failed to export SBML.");
  }
}
