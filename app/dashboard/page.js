import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SavedSimulationList from "@/components/dashboard/SavedSimulationList";
import { listSavedSimulationsForUser } from "@/lib/saved-simulations/service";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const savedSimulations = await listSavedSimulationsForUser(session.user.id);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Saved Simulations
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Signed in as {session.user.email || "authenticated user"}.
        </p>
      </div>

      <SavedSimulationList initialItems={savedSimulations} />
    </div>
  );
}
