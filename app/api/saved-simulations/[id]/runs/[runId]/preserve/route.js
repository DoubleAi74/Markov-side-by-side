import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateRunForModel } from "@/lib/run-history/service";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const { id, runId } = await params;
    const run = await updateRunForModel(id, runId, session.user.id, {
      preserved: body.preserved !== false,
    });
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    return NextResponse.json(run);
  } catch (error) {
    if (error.code === "PRESERVED_RUN_LIMIT") {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return internalErrorResponse(error, "Failed to preserve run.");
  }
}
