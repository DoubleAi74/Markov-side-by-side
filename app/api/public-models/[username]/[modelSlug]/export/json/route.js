import { NextResponse } from "next/server";
import { getPublicSavedSimulationByUsernameAndSlug } from "@/lib/saved-simulations/service";
import { createMarkovLabModelExport } from "@/lib/interchange/json";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const { username, modelSlug } = await params;
    const result = await getPublicSavedSimulationByUsernameAndSlug(username, modelSlug, { includePayload: true });
    if (!result?.savedSimulation) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }
    const body = createMarkovLabModelExport(result.savedSimulation);
    return new NextResponse(`${JSON.stringify(body, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.savedSimulation.slug}.json"`,
        "Cache-Control": "public, max-age=0, s-maxage=60",
      },
    });
  } catch (error) {
    return internalErrorResponse(error, "Failed to export model.");
  }
}
