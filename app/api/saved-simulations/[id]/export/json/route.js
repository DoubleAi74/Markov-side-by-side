import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSavedSimulationForUser } from "@/lib/saved-simulations/service";
import { createMarkovLabModelExport } from "@/lib/interchange/json";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const model = await getSavedSimulationForUser(id, session.user.id, { includePayload: true });
    if (!model) return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    const body = createMarkovLabModelExport(model);
    return new NextResponse(`${JSON.stringify(body, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${model.slug || "model"}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return internalErrorResponse(error, "Failed to export model.");
  }
}
