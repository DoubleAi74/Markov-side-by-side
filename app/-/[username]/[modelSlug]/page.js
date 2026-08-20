import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import CTMPInhomoSimulator from "@/components/simulators/ctmp-inhomo/CTMPInhomoSimulator";
import GillespieSimulator from "@/components/simulators/gillespie/GillespieSimulator";
import SDESimulator from "@/components/simulators/sde/SDESimulator";
import { buildSessionUser } from "@/lib/auth/session-user";
import { getPublicSavedSimulationByUsernameAndSlug } from "@/lib/saved-simulations/service";
import {
  normalizeSavedSimulationSlug,
  normalizeUsernameSlug,
} from "@/lib/slugs";

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PublicSavedModelPage({ params }) {
  const { username, modelSlug } = await params;
  const normalizedUsername = normalizeUsernameSlug(username);
  const normalizedModelSlug = normalizeSavedSimulationSlug(modelSlug);

  if (!normalizedUsername || !normalizedModelSlug) {
    notFound();
  }

  if (normalizedUsername !== username || normalizedModelSlug !== modelSlug) {
    redirect(
      `/-/${encodeURIComponent(normalizedUsername)}/${encodeURIComponent(normalizedModelSlug)}`,
    );
  }

  const publicModel = await getPublicSavedSimulationByUsernameAndSlug(
    normalizedUsername,
    normalizedModelSlug,
    { includePayload: true },
  );

  if (!publicModel?.savedSimulation) {
    notFound();
  }

  const session = await auth();
  const sessionUser = await buildSessionUser(session, { ensureUsername: true });
  const canEditCurrentModel = Boolean(
    sessionUser?.id && sessionUser.id === publicModel.owner.id,
  );

  const simulatorProps = {
    sessionUser,
    initialSavedSimulation: publicModel.savedSimulation,
    canEditCurrentModel,
    exportUsername: publicModel.owner.username,
  };

  if (publicModel.savedSimulation.simulatorType === "gillespie") {
    return <GillespieSimulator {...simulatorProps} />;
  }

  if (publicModel.savedSimulation.simulatorType === "ctmp-inhomo") {
    return <CTMPInhomoSimulator {...simulatorProps} />;
  }

  if (publicModel.savedSimulation.simulatorType === "sde") {
    return <SDESimulator {...simulatorProps} />;
  }

  notFound();
}
