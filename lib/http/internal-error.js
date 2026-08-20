import "server-only";
import { NextResponse } from "next/server";

/**
 * Record the real server failure without disclosing database, storage, or
 * filesystem details to an API caller.
 */
export function internalErrorResponse(error, publicMessage) {
  console.error(`[Markov Lab] ${publicMessage}`, error);
  return NextResponse.json({ error: publicMessage }, { status: 500 });
}
