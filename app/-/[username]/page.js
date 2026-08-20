import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { buildSessionUser } from "@/lib/auth/session-user";
import { listPublicSavedSimulationsByUsername, listSavedSimulationsForUser } from "@/lib/saved-simulations/service";
import { normalizeUsernameSlug } from "@/lib/slugs";
import UserDashboardShell from "@/components/dashboard/UserDashboardShell";

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function UserDashboardPage({ params }) {
  const { username } = await params;
  const normalizedUsername = normalizeUsernameSlug(username);

  if (!normalizedUsername) {
    notFound();
  }

  if (normalizedUsername !== username) {
    redirect(`/-/${encodeURIComponent(normalizedUsername)}`);
  }

  const session = await auth();
  const sessionUser = await buildSessionUser(session, { ensureUsername: true });
  const publicDashboard = await listPublicSavedSimulationsByUsername(
    normalizedUsername,
  );

  if (!publicDashboard) {
    notFound();
  }

  const isOwner = Boolean(
    sessionUser?.id && sessionUser.id === publicDashboard.owner.id,
  );
  const initialItems = isOwner
    ? await listSavedSimulationsForUser(sessionUser.id)
    : publicDashboard.items;

  return (
    <UserDashboardShell
      ownerUsername={publicDashboard.owner.username}
      initialItems={initialItems}
      isOwner={isOwner}
      sessionEmail={isOwner ? sessionUser.email : null}
    />
  );
}
