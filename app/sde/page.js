import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import SDESimulator from "@/components/simulators/sde/SDESimulator";
import { getSavedSimulationForUser } from "@/lib/saved-simulations/service";

export default async function SDEPage({ searchParams }) {
  const session = await auth();
  const params = await searchParams;
  const modelId = typeof params?.model === "string" ? params.model : null;
  let initialSavedSimulation = null;

  if (modelId) {
    if (!session?.user?.id) {
      redirect(`/login?callbackUrl=${encodeURIComponent(`/sde?model=${modelId}`)}`);
    }

    initialSavedSimulation = await getSavedSimulationForUser(modelId, session.user.id);
    if (!initialSavedSimulation || initialSavedSimulation.simulatorType !== "sde") {
      notFound();
    }
  }

  const sessionUser = session?.user?.id
    ? {
        id: session.user.id,
        email: session.user.email ?? "",
        name: session.user.name ?? "",
      }
    : null;

  return (
    <SDESimulator
      sessionUser={sessionUser}
      initialSavedSimulation={initialSavedSimulation}
    />
  );
}
