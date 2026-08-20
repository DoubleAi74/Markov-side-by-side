import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { forkSavedSimulationForUser } from "@/lib/saved-simulations/service";
import { ValidationError, VISIBILITY_VALUES } from "@/lib/saved-simulations/validators";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    if (body.visibility && !VISIBILITY_VALUES.includes(body.visibility)) {
      throw new ValidationError("visibility must be public or private.");
    }
    if (body.name != null && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120)) {
      throw new ValidationError("name must be between 1 and 120 characters.");
    }
    const { id } = await params;
    const forked = await forkSavedSimulationForUser(id, session.user.id, {
      name: body.name?.trim(),
      visibility: body.visibility,
    });
    if (!forked) return NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });
    return NextResponse.json(forked, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return internalErrorResponse(error, "Failed to fork model.");
  }
}
