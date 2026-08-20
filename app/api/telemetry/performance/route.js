import { NextResponse } from "next/server";
import { sanitizePerformanceTelemetry } from "@/lib/telemetry/performance";

export const runtime = "nodejs";

export async function POST(request) {
  if (process.env.MARKOV_LAB_PERFORMANCE_TELEMETRY_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4096) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  try {
    const event = sanitizePerformanceTelemetry(await request.json());
    console.info(JSON.stringify({ event: "markov-lab-performance", receivedAt: new Date().toISOString(), metrics: event }));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
