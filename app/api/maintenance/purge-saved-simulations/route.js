import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { purgeExpiredSavedSimulations } from "@/lib/saved-simulations/service";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = process.env.MARKOV_LAB_MAINTENANCE_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const result = await purgeExpiredSavedSimulations();
    return NextResponse.json({
      purged: result.count,
      previewObjectsDeleted: result.previewObjectsDeleted,
      previewDeleteFailures: result.previewDeleteFailures.length,
    });
  } catch (error) {
    return internalErrorResponse(error, "Purge failed.");
  }
}
