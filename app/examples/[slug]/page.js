import { notFound } from "next/navigation";
import { auth } from "@/auth";
import CTMPInhomoSimulator from "@/components/simulators/ctmp-inhomo/CTMPInhomoSimulator";
import DiscreteTimeSimulator from "@/components/simulators/discrete-time/DiscreteTimeSimulator";
import GillespieSimulator from "@/components/simulators/gillespie/GillespieSimulator";
import SDESimulator from "@/components/simulators/sde/SDESimulator";
import { buildSessionUser } from "@/lib/auth/session-user";
import {
  getExampleBySlug,
  toExampleSavedSimulation,
} from "@/lib/examples/models";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const example = getExampleBySlug(slug);

  if (!example) {
    return { title: "Example" };
  }

  return {
    title: `${example.name} · Markov Lab`,
    description: example.description,
  };
}

export default async function ExampleModelPage({ params }) {
  const { slug } = await params;
  const example = getExampleBySlug(slug);

  if (!example) {
    notFound();
  }

  const session = await auth();
  const sessionUser = await buildSessionUser(session, { ensureUsername: true });
  const simulatorProps = {
    sessionUser,
    initialSavedSimulation: toExampleSavedSimulation(example),
    canEditCurrentModel: false,
  };

  if (example.simulatorType === "gillespie") {
    return <GillespieSimulator {...simulatorProps} />;
  }

  if (example.simulatorType === "ctmp-inhomo") {
    return <CTMPInhomoSimulator {...simulatorProps} />;
  }

  if (example.simulatorType === "sde") {
    return <SDESimulator {...simulatorProps} />;
  }

  if (example.simulatorType === "discrete-time") {
    return <DiscreteTimeSimulator {...simulatorProps} />;
  }

  notFound();
}
