import ExampleCard from "@/components/examples/ExampleCard";
import SimulatorTypeCard, {
  SIMULATOR_TYPE_CARDS,
} from "@/components/SimulatorTypeCard";
import { EXAMPLE_MODELS } from "@/lib/examples/models";

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 pt-8 md:pt-12 pb-12 md:pb-16">
      {/* Hero */}
      <div className="text-center mb-8 md:mb-12">
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
          Markov Lab
        </h1>
        <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto">
          Simulate any Markov process. Models are covered in four categories.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {SIMULATOR_TYPE_CARDS.map((simulator) => (
          <SimulatorTypeCard
            key={simulator.path}
            href={simulator.path}
            {...simulator}
          />
        ))}
      </div>

      <div className="mx-auto mt-10 w-[85%] md:mt-14">
        <h2 className="mb-6 text-center text-sm font-semibold uppercase tracking-wide text-slate-400 md:mb-8">
          Examples
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {EXAMPLE_MODELS.map((example) => (
            <ExampleCard key={example.slug} example={example} />
          ))}
        </div>
      </div>
    </div>
  );
}
