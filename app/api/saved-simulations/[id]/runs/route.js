import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createRunForModel, listRunsForModel } from "@/lib/run-history/service";
import { RunHistoryValidationError, validateCreateRunInput } from "@/lib/run-history/validators";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";
const notFound = () => NextResponse.json({ error: "Saved simulation not found." }, { status: 404 });

export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const search = new URL(request.url).searchParams;
    const items = await listRunsForModel(id, session.user.id, {
      cursor: search.get("cursor"),
      limit: search.get("limit"),
      preserved: search.get("preserved") === "true" ? true : undefined,
    });
    return items ? NextResponse.json(items) : notFound();
  } catch (error) {
    return internalErrorResponse(error, "Failed to list runs.");
  }
}

export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = validateCreateRunInput(await request.json());
    const { id } = await params;
    const created = await createRunForModel(id, session.user.id, input);
    return created ? NextResponse.json(created, { status: 201 }) : notFound();
  } catch (error) {
    if (error instanceof RunHistoryValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message || "Request body must be valid JSON." }, { status: 400 });
    }
    return internalErrorResponse(error, "Failed to save run.");
  }
}
