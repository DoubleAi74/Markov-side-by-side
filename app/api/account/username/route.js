import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAuthUserUsername,
  updateAuthUsername,
  UsernameConflictError,
  UsernameInputError,
} from "@/lib/auth/users";
import { internalErrorResponse } from "@/lib/http/internal-error";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function getSessionUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new UsernameInputError("Request body must be valid JSON.");
  }
}

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const ensured = await ensureAuthUserUsername(
      sessionUser.id,
      sessionUser.name || sessionUser.email || "",
    );

    return NextResponse.json({
      username: ensured?.username ?? null,
    });
  } catch (error) {
    return internalErrorResponse(error, "Failed to fetch username.");
  }
}

export async function PATCH(request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await readJson(request);
    const updated = await updateAuthUsername(sessionUser.id, body?.username);

    if (!updated) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      username: updated.username ?? null,
    });
  } catch (error) {
    if (error instanceof UsernameInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof UsernameConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return internalErrorResponse(error, "Failed to update username.");
  }
}
