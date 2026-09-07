import { NextResponse } from "next/server";
import { AuthInputError } from "@/lib/auth/passwords";
import { resetPasswordWithToken } from "@/lib/auth/password-reset-service";

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
    const result = await resetPasswordWithToken({
      token: body?.token,
      password: body?.password,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: error.message || "Failed to reset password.",
      },
      { status: 500 },
    );
  }
}
