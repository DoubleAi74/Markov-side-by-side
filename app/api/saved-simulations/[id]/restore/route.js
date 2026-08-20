import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { restoreSavedSimulationForUser } from "@/lib/saved-simulations/service";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const restored = await restoreSavedSimulationForUser(id, session.user.id);
    if (!restored) {
      return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    }
    return NextResponse.json(restored);
  } catch (error) {
    return internalErrorResponse(error, "Failed to restore model.");
  }
}
