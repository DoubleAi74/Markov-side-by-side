import "server-only";
import { ensureAuthUserUsername } from "@/lib/auth/users";

export async function buildSessionUser(session, { ensureUsername = false } = {}) {
  if (!session?.user?.id) {
    return null;
  }

  let username =
    typeof session.user.username === "string" && session.user.username.trim()
      ? session.user.username.trim()
      : null;

  if (ensureUsername) {
    const ensured = await ensureAuthUserUsername(
      session.user.id,
      session.user.name || session.user.email || "",
    );
    username = ensured?.username ?? username;
  }

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    username,
  };
}
