import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import GillespieSimulator from "@/components/simulators/gillespie/GillespieSimulator";
import { getSavedSimulationForUser } from "@/lib/saved-simulations/service";

export default async function GillespiePage({ searchParams }) {
  const session = await auth();
  const params = await searchParams;
  const modelId = typeof params?.model === "string" ? params.model : null;
  let initialSavedSimulation = null;

  if (modelId) {
    if (!session?.user?.id) {
      redirect(`/login?callbackUrl=${encodeURIComponent(`/gillespie?model=${modelId}`)}`);
    }

    initialSavedSimulation = await getSavedSimulationForUser(modelId, session.user.id);
    if (!initialSavedSimulation || initialSavedSimulation.simulatorType !== "gillespie") {
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
    <GillespieSimulator
      sessionUser={sessionUser}
      initialSavedSimulation={initialSavedSimulation}
    />
  );
}
