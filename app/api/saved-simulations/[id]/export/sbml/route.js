import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSavedSimulationForUser } from "@/lib/saved-simulations/service";
import { createSBMLExport, SBMLCompatibilityError } from "@/lib/interchange/sbml";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const model = await getSavedSimulationForUser(id, session.user.id, { includePayload: true });
    if (!model) return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    return new NextResponse(createSBMLExport(model), {
      headers: {
        "Content-Type": "application/sbml+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${model.slug || "model"}.xml"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof SBMLCompatibilityError) {
      return NextResponse.json({ error: error.message, compatible: false, issues: error.issues }, { status: 422 });
    }
    return internalErrorResponse(error, "Failed to export SBML.");
  }
}
