import { NextResponse } from "next/server";
import {
  AuthConflictError,
  AuthInputError,
  registerPasswordAccount,
} from "@/lib/auth/credentials-service";

export const runtime = "nodejs";

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new AuthInputError("Request body must be valid JSON.");
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const createdUser = await registerPasswordAccount(body);
    return NextResponse.json(
      {
        ok: true,
        user: createdUser,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof AuthConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to create password account." },
      { status: 500 },
    );
  }
}
