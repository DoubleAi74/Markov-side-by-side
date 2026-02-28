import Link from "next/link";

const SIMULATORS = [
  {
    href: "/gillespie",
    title: "Reaction Network Designer",
    subtitle: "CTMC Gillespie",
    description:
      "Exact stochastic simulation of biochemical reaction networks. Define species, parameters, and transitions — the Gillespie algorithm draws exact inter-event times.",
    badge: "Exact SSA",
    badgeColor: "bg-blue-100 text-blue-700",
    accent: "border-t-blue-500",
    preset: "Preset: 3-species food chain",
  },
  {
    href: "/ctmp-inhomo",
    title: "Time-Dependent Simulator",
    subtitle: "Fixed Time-Step CTMP",
    description:
      "Simulate continuous-time Markov processes with time-varying rates. Define arbitrary f(t) helper functions and use them directly in your transition rates.",
    badge: "Fixed Δt",
    badgeColor: "bg-indigo-100 text-indigo-700",
    accent: "border-t-indigo-500",
    preset: "Presets: Waning Birth, Seasonal Lotka-Volterra",
  },
  {
    href: "/sde",
    title: "SDE Solver",
    subtitle: "Euler-Maruyama Method",
    description:
      "Numerically solve systems of stochastic differential equations dX = f(X,t)dt + g(X,t)dW. Run multiple realizations simultaneously to visualize path distributions.",
    badge: "Euler-Maruyama",
    badgeColor: "bg-purple-100 text-purple-700",
    accent: "border-t-purple-500",
    preset: "Preset: Stochastic Lotka-Volterra (Prey-Pred)",
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
          Interactive tools for simulating stochastic processes directly in the
          browser. No installation required — define your model and run.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
        {SIMULATORS.map(
          ({
            href,
            title,
            subtitle,
            description,
            badge,
            badgeColor,
            accent,
            preset,
          }) => (
            <Link
              key={href}
              href={href}
              className={`group bg-white rounded-xl shadow-sm border border-slate-200 border-t-4 ${accent} p-4 md:p-6 hover:shadow-md transition-shadow flex flex-col`}
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}
                >
                  {badge}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">
                {title}
              </h2>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
                {subtitle}
              </p>
              <p className="text-sm text-slate-500 flex-1 leading-relaxed">
                {description}
              </p>
              <p className="mt-4 text-xs text-slate-400 italic">{preset}</p>
              <div className="mt-4 text-sm font-semibold text-indigo-600 group-hover:underline">
                Open simulator →
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
