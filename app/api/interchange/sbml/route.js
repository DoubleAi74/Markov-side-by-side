import { NextResponse } from "next/server";
import { createSBMLExport, parseSBMLImport, SBMLCompatibilityError } from "@/lib/interchange/sbml";
import { validateModelV2 } from "@/lib/model-v2/schema";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("xml")) {
      return NextResponse.json(parseSBMLImport(await request.text()), { headers: { "Cache-Control": "no-store" } });
    }
    const body = await request.json();
    const validation = validateModelV2(body?.model);
    if (!validation.ok) return NextResponse.json({ error: "Invalid canonical model.", issues: validation.issues }, { status: 400 });
    const xml = createSBMLExport({ id: "local-export", name: body.name || "Markov Lab model", slug: "markov-lab-model", simulatorType: body.model.solverFamily, payloadVersion: 2, payload: body.model });
    return new NextResponse(xml, { headers: { "Content-Type": "application/sbml+xml; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SBMLCompatibilityError) return NextResponse.json({ error: error.message, compatible: false, issues: error.issues }, { status: 422 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    return internalErrorResponse(error, "SBML interchange failed.");
  }
}
