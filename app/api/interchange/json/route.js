import { NextResponse } from "next/server";
import { parseMarkovLabModelImport } from "@/lib/interchange/json";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Import exceeds the 2 MiB limit." }, { status: 413 });
    }
    return NextResponse.json(parseMarkovLabModelImport(JSON.parse(text)));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Invalid model JSON." }, { status: 400 });
  }
}
