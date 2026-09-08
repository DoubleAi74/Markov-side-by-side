import { auth } from "@/auth";
import CommunityGrid from "@/components/community/CommunityGrid";
import { buildSessionUser } from "@/lib/auth/session-user";
import { listCommunityMembers } from "@/lib/community/service";

export const metadata = {
  title: "Community · Markov Lab",
  description: "People sharing stochastic models on Markov Lab.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CommunityPage() {
  const session = await auth();
  const sessionUser = await buildSessionUser(session, { ensureUsername: true });
  const members = await listCommunityMembers();
  const viewerId = sessionUser?.id ?? null;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-8 md:py-12">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Community
        </h1>
        <p className="text-sm text-slate-500">
          Everyone who has saved a model. Open a card to browse their models.
        </p>
      </header>

      <CommunityGrid
        initialMembers={members}
        viewerId={viewerId}
        viewerIsMember={members.some((member) => member.id === viewerId)}
      />
    </div>
  );
}
