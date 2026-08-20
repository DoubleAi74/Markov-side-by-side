import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRunForModel, updateRunForModel } from "@/lib/run-history/service";
import { RunHistoryValidationError, validateUpdateRunInput } from "@/lib/run-history/validators";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";
const notFound = () => NextResponse.json({ error: "Run not found." }, { status: 404 });

export async function GET(_request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, runId } = await params;
    const run = await getRunForModel(id, runId, session.user.id);
    return run ? NextResponse.json(run) : notFound();
  } catch (error) {
    return internalErrorResponse(error, "Failed to load run.");
  }
}

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const changes = validateUpdateRunInput(await request.json());
    const { id, runId } = await params;
    const run = await updateRunForModel(id, runId, session.user.id, changes);
    return run ? NextResponse.json(run) : notFound();
  } catch (error) {
    if (error instanceof RunHistoryValidationError || error.code === "PRESERVED_RUN_LIMIT") {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return internalErrorResponse(error, "Failed to update run.");
  }
}
