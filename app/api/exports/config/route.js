import { NextResponse } from "next/server";
import { createLiveConfigExport } from "@/lib/exports/live";
import { ValidationError } from "@/lib/saved-simulations/validators";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const exported = createLiveConfigExport(body);
    return new NextResponse(exported.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ValidationError || error?.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error.message || "Failed to export model config." },
      { status: 400 },
    );
  }
}
