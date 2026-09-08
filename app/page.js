import Link from "next/link";
import ExampleCard from "@/components/examples/ExampleCard";
import { EXAMPLE_MODELS } from "@/lib/examples/models";

const SIMULATORS = [
  {
    href: "/gillespie",
    title: "Homogeneous CTMC",
    description: "Continuous time, discrete space, constant rates.",
    accent: "border-t-blue-500",
  },
  {
    href: "/ctmp-inhomo",
    title: "Inhomogeneous CTMC",
    description: "Continuous time, discrete space, time variable rates.",
    accent: "border-t-blue-700",
  },
  {
    href: "/sde",
    title: "Differential equations with stochastic noise (SDEs)",
    description: "Continuous time, continuous space.",
    accent: "border-t-amber-500",
  },
  {
    href: "/discrete-time",
    title: "Discrete-time Markov processes",
    description: "Discrete time, discrete space.",
    accent: "border-t-emerald-600",
  },
];

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 pt-8 md:pt-12 pb-12 md:pb-16">
      {/* Hero */}
      <div className="text-center mb-8 md:mb-12">
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
          Markov Side-by-Side
        </h1>
        <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto">
          Simulate any Markov process. Models are covered in four categories.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        {SIMULATORS.map(({ href, title, description, accent }) => (
          <Link
            key={href}
            href={href}
            className={`group bg-white rounded-xl shadow-sm border border-slate-200 border-t-4 ${accent} p-4 md:p-6 hover:shadow-md transition-shadow flex flex-col`}
          >
            <h2 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-blue-900 transition-colors">
              {title}
            </h2>
            <p className="text-sm text-slate-500 flex-1 leading-relaxed">
              {description}
            </p>
            <div className="mt-4 text-sm font-semibold text-blue-900 group-hover:underline">
              Open simulator →
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10 md:mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
          Examples
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
          {EXAMPLE_MODELS.map((example) => (
            <ExampleCard key={example.slug} example={example} />
          ))}
        </div>
      </div>
    </div>
  );
}
