"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import SimulatorTypeCard, {
  SIMULATOR_TYPE_CARDS,
} from "@/components/SimulatorTypeCard";

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

          <div className="mt-5 grid grid-cols-2 gap-3">
            {SIMULATOR_TYPE_CARDS.map((simulator, index) => (
              <SimulatorTypeCard
                key={simulator.path}
                href={`${simulator.path}?blank=1`}
                {...simulator}
                target="_blank"
                rel="noopener noreferrer"
                autoFocus={index === 0}
                compactNote={false}
                onClick={() => setIsOpen(false)}
              />
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
