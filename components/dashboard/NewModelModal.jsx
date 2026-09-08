"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

const MODEL_OPTIONS = [
  {
    href: "/gillespie?blank=1",
    title: "CTMC Gillespie",
    subtitle: "Exact stochastic simulation",
    description: "Build an event-driven reaction network.",
  },
  {
    href: "/ctmp-inhomo?blank=1",
    title: "CTMP Time Var",
    subtitle: "Time-dependent Markov process",
    description: "Define transitions with time-varying rates.",
  },
  {
    href: "/sde?blank=1",
    title: "SDE Solver",
    subtitle: "Euler-Maruyama method",
    description: "Create a system of drift and diffusion equations.",
  },
  {
    href: "/discrete-time?blank=1",
    title: "Discrete Time",
    subtitle: "Generation-by-generation process",
    description: "Define independent per-individual transition probabilities.",
  },
];

export default function NewModelModal() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add model
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setIsOpen(false);
          }
        }}
        aria-labelledby="new-model-title"
        className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="new-model-title"
                className="text-xl font-bold tracking-tight text-slate-900"
              >
                Create a new model
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose a model type to open a blank editor in a new tab.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              aria-label="Close new model dialog"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {MODEL_OPTIONS.map(({ href, title, subtitle, description }, index) => (
              <Link
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                autoFocus={index === 0}
                onClick={() => setIsOpen(false)}
                className="group flex min-h-44 flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                <span className="text-base font-bold text-slate-900 group-hover:text-blue-950">
                  {title}
                </span>
                <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {subtitle}
                </span>
                <span className="mt-3 text-sm leading-relaxed text-slate-600">
                  {description}
                </span>
                <span className="mt-auto pt-4 text-xs font-semibold text-blue-900">
                  Open blank model ↗
                </span>
              </Link>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
