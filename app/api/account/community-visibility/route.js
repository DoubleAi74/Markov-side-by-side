import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { setCommunityVisibility } from "@/lib/community/service";
import {
  CommunityValidationError,
  validateCommunityVisibilityInput,
} from "@/lib/community/validators";

export const runtime = "nodejs";

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new CommunityValidationError("Request body must be valid JSON.");
    }

    const { hidden } = validateCommunityVisibilityInput(body);
    const updated = await setCommunityVisibility(session.user.id, hidden);
    if (!updated) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof CommunityValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to update community visibility." },
      { status: 500 },
    );
  }
}
