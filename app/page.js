import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ExampleCard from "@/components/examples/ExampleCard";
import { EXAMPLE_MODELS } from "@/lib/examples/models";

const SIMULATORS = [
  {
    href: "/gillespie",
    title: "CTMC",
    titleNote: "homogeneous",
    titleNoteShort: "hom.",
    ariaName: "homogeneous CTMC",
    description: "Discrete space, constant rates.",
    accent: "bg-[#157C94]", // turquoise blue
  },
  {
    href: "/ctmp-inhomo",
    title: "CTMC",
    titleNote: "inhomogeneous",
    titleNoteShort: "inhom.",
    ariaName: "inhomogeneous CTMC",
    description: "Discrete space, variable rates.",
    accent: "bg-[#B02B42]", // wine red
  },
  {
    href: "/sde",
    title: "SDEs",
    ariaName: "SDEs",
    description: "Continuous time and space.",
    accent: "bg-[#F0915E]", // pastel flame orange
  },
  {
    href: "/discrete-time",
    title: "Discrete-time",
    ariaName: "Discrete-time",
    description: "Discrete time and space.",
    accent: "bg-[#2F6B35]", // deep leafy green
  },
];

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
        {SIMULATORS.map(({ href, title, titleNote, titleNoteShort, ariaName, description, accent }) => (
          <Link
            key={href}
            href={href}
            aria-label={`Open ${ariaName} simulator`}
            className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition duration-150 hover:border-slate-300 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <div className="relative flex flex-1 flex-col p-3 md:p-4">
              <h2 className="mb-1 pr-5 whitespace-nowrap text-sm font-bold text-slate-800 transition-colors group-hover:text-slate-950 sm:text-base md:text-lg">
                {title}
                {titleNote ? (
                  <span className="ml-0.5 text-[10px] font-medium text-slate-500 transition-colors group-hover:text-slate-600 sm:ml-1 sm:text-xs">
                    (
                    <span className="md:hidden lg:inline">{titleNote}</span>
                    <span className="hidden md:inline lg:hidden">
                      {titleNoteShort}
                    </span>
                    )
                  </span>
                ) : null}
              </h2>
              <p className="flex-1 text-xs leading-snug text-slate-500 md:text-sm md:leading-relaxed">
                {description}
              </p>
              <ArrowRight
                aria-hidden="true"
                strokeWidth={1.5}
                className="absolute right-2 top-2 size-3.5 text-slate-300 transition duration-150 group-hover:translate-x-0.5 group-hover:text-slate-500 md:right-3 md:top-3"
              />
            </div>
            <div
              className={`h-[9.6px] opacity-60 transition-opacity duration-150 group-hover:opacity-100 ${accent}`}
              aria-hidden="true"
            />
          </Link>
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
