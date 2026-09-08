import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import DiscreteTimeSimulator from "@/components/simulators/discrete-time/DiscreteTimeSimulator";
import { buildSessionUser } from "@/lib/auth/session-user";
import { getSavedSimulationForUser } from "@/lib/saved-simulations/service";

export default async function DiscreteTimePage({ searchParams }) {
  const session = await auth();
  const sessionUser = await buildSessionUser(session, { ensureUsername: true });
  const params = await searchParams;
  const modelId = typeof params?.model === "string" ? params.model : null;
  const startBlank = !modelId && params?.blank === "1";
  let initialSavedSimulation = null;

  if (modelId) {
    if (!sessionUser?.id) {
      redirect(
        `/login?callbackUrl=${encodeURIComponent(`/discrete-time?model=${modelId}`)}`,
      );
    }

    initialSavedSimulation = await getSavedSimulationForUser(
      modelId,
      sessionUser.id,
    );
    if (
      !initialSavedSimulation ||
      initialSavedSimulation.simulatorType !== "discrete-time"
    ) {
      notFound();
    }

    if (sessionUser.username && initialSavedSimulation.slug) {
      redirect(
        `/-/${encodeURIComponent(sessionUser.username)}/${encodeURIComponent(initialSavedSimulation.slug)}`,
      );
    }
  }

  return (
    <DiscreteTimeSimulator
      sessionUser={sessionUser}
      initialSavedSimulation={initialSavedSimulation}
      startBlank={startBlank}
    />
  );
}
