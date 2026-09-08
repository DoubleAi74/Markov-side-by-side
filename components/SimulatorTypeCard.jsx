import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const SIMULATOR_TYPE_CARDS = [
  {
    path: "/gillespie",
    title: "CTMC",
    titleNote: "homogeneous",
    titleNoteShort: "hom.",
    ariaName: "homogeneous CTMC",
    description: "Discrete space, constant rates.",
    accent: "bg-[#157C94]",
  },
  {
    path: "/ctmp-inhomo",
    title: "CTMC",
    titleNote: "inhomogeneous",
    titleNoteShort: "inhom.",
    ariaName: "inhomogeneous CTMC",
    description: "Discrete space, variable rates.",
    accent: "bg-[#B02B42]",
  },
  {
    path: "/sde",
    title: "SDEs",
    ariaName: "SDEs",
    description: "Continuous time and space.",
    accent: "bg-[#F0915E]",
  },
  {
    path: "/discrete-time",
    title: "Discrete-time",
    ariaName: "Discrete-time",
    description: "Discrete time and space.",
    accent: "bg-[#2F6B35]",
  },
];

export default function SimulatorTypeCard({
  href,
  title,
  titleNote,
  titleNoteShort,
  ariaName,
  description,
  accent,
  target,
  rel,
  autoFocus = false,
  onClick,
  compactNote = true,
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      autoFocus={autoFocus}
      onClick={onClick}
      aria-label={`Open ${ariaName} simulator`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition duration-150 hover:border-slate-300 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      <div className="relative flex flex-1 flex-col p-3 md:p-4">
        <h2 className="mb-1 pr-5 whitespace-nowrap text-sm font-bold text-slate-800 transition-colors group-hover:text-slate-950 sm:text-base md:text-lg">
          {title}
          {titleNote ? (
            <span className="ml-0.5 text-[10px] font-medium text-slate-500 transition-colors group-hover:text-slate-600 sm:ml-1 sm:text-xs">
              (
              {compactNote ? (
                <>
                  <span className="md:hidden lg:inline">{titleNote}</span>
                  <span className="hidden md:inline lg:hidden">
                    {titleNoteShort}
                  </span>
                </>
              ) : (
                titleNote
              )}
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
  );
}
