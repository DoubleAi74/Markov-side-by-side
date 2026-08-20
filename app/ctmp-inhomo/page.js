import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import CTMPInhomoSimulator from "@/components/simulators/ctmp-inhomo/CTMPInhomoSimulator";
import { buildSessionUser } from "@/lib/auth/session-user";
import { getSavedSimulationForUser } from "@/lib/saved-simulations/service";

export default async function CTMPInhomoPage({ searchParams }) {
  const session = await auth();
  const sessionUser = await buildSessionUser(session, { ensureUsername: true });
  const params = await searchParams;
  const modelId = typeof params?.model === "string" ? params.model : null;
  let initialSavedSimulation = null;

  if (modelId) {
    if (!sessionUser?.id) {
      redirect(`/login?callbackUrl=${encodeURIComponent(`/ctmp-inhomo?model=${modelId}`)}`);
    }

    initialSavedSimulation = await getSavedSimulationForUser(modelId, sessionUser.id);
    if (
      !initialSavedSimulation ||
      initialSavedSimulation.simulatorType !== "ctmp-inhomo"
    ) {
      notFound();
    }

    if (initialSavedSimulation.visibility !== "private" && sessionUser.username && initialSavedSimulation.slug) {
      redirect(
        `/-/${encodeURIComponent(sessionUser.username)}/${encodeURIComponent(initialSavedSimulation.slug)}`,
      );
    }
  }

  return (
    <CTMPInhomoSimulator
      sessionUser={sessionUser}
      initialSavedSimulation={initialSavedSimulation}
    />
  );
}
