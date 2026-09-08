import "server-only";
import { ensureAuthUserUsername } from "@/lib/auth/users";
import { toPublicProfileImage } from "@/lib/community/profile";

export async function buildSessionUser(session, { ensureUsername = false } = {}) {
  if (!session?.user?.id) {
    return null;
  }

  let username =
    typeof session.user.username === "string" && session.user.username.trim()
      ? session.user.username.trim()
      : null;

  let stored = null;
  if (ensureUsername) {
    stored = await ensureAuthUserUsername(
      session.user.id,
      session.user.name || session.user.email || "",
    );
    username = stored?.username ?? username;
  }

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    username,
    profileImage: toPublicProfileImage(stored?.profileImage),
    communityHidden: stored?.communityHidden === true,
  };
}
