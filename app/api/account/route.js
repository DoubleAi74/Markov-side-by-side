import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteAccountForUser } from "@/lib/account/deletion-service";
import {
  ACCOUNT_DELETION_PHRASE,
  matchesDeletionPhrase,
} from "@/lib/account/deletion";

export const runtime = "nodejs";

/**
 * Permanently deletes the signed-in user's account. The target is always the
 * session user — there is no id in the request — and the typed confirmation is
 * re-checked here rather than trusted from the UI.
 */
export async function DELETE(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!matchesDeletionPhrase(body?.confirmation)) {
    return NextResponse.json(
      { error: `Type "${ACCOUNT_DELETION_PHRASE}" to confirm.` },
      { status: 400 },
    );
  }

  try {
    const result = await deleteAccountForUser(session.user.id);
    if (!result) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to delete the account." },
      { status: 500 },
    );
  }
}
