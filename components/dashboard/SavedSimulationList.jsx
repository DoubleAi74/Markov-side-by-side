"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SAVED_SIMULATION_PREVIEW_UPDATED_EVENT } from "@/lib/previews/events";

const ROUTE_BY_SIMULATOR = {
  gillespie: "/gillespie",
  "ctmp-inhomo": "/ctmp-inhomo",
  sde: "/sde",
};

const CARD_IMAGE_SIZES =
  "(min-width: 1280px) 240px, (min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw";

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "Unknown";

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    const year = date.getUTCFullYear();
    const month = padDatePart(date.getUTCMonth() + 1);
    const day = padDatePart(date.getUTCDate());
    const hours = padDatePart(date.getUTCHours());
    const minutes = padDatePart(date.getUTCMinutes());
    const seconds = padDatePart(date.getUTCSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
  } catch {
    return "Unknown";
  }
}

function formatSimulatorLabel(simulatorType) {
  if (simulatorType === "gillespie") return "CTMC Gillespie";
  if (simulatorType === "ctmp-inhomo") return "CTMP Time Var";
  return "SDE Solver";
}

function PreviewFallback({ simulatorType }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-br from-slate-200 via-slate-100 to-white p-4">
      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
        {formatSimulatorLabel(simulatorType)}
      </span>
      <p className="mt-3 text-sm font-medium text-slate-600">
        No preview yet
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Save the model first, then use Set Image to generate a chart thumbnail.
      </p>
    </div>
  );
}

export default function SavedSimulationList({ initialItems = [] }) {
  const [items, setItems] = useState(initialItems);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const handlePreviewUpdated = (event) => {
      const savedSimulation = event.detail?.savedSimulation;
      if (!savedSimulation?.id) {
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.id === savedSimulation.id
            ? {
                ...item,
                preview: savedSimulation.preview ?? null,
                updatedAt: savedSimulation.updatedAt ?? item.updatedAt,
              }
            : item,
        ),
      );
    };

    window.addEventListener(
      SAVED_SIMULATION_PREVIEW_UPDATED_EVENT,
      handlePreviewUpdated,
    );
    return () =>
      window.removeEventListener(
        SAVED_SIMULATION_PREVIEW_UPDATED_EVENT,
        handlePreviewUpdated,
      );
  }, []);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aTime = new Date(a.updatedAt || 0).getTime();
        const bTime = new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      }),
    [items],
  );

  const handleDelete = async (id, name) => {
    const confirmed = window.confirm(
      `Delete "${name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(id);
    setError("");

    try {
      const response = await fetch(`/api/saved-simulations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete saved simulation.");
      }

      setItems((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete saved simulation.");
    } finally {
      setDeletingId(null);
    }
  };

  if (sortedItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        You have no saved simulations yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {sortedItems.map((item) => {
          const preview = item.preview ?? null;
          const imageAlt = `${item.name} preview`;

          return (
            <article
              key={item.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] border-b border-slate-200 bg-slate-100">
                {preview?.imageUrl ? (
                  <Image
                    src={preview.imageUrl}
                    alt={imageAlt}
                    fill
                    sizes={CARD_IMAGE_SIZES}
                    className="object-cover"
                    placeholder={preview.blurDataURL ? "blur" : "empty"}
                    blurDataURL={preview.blurDataURL || undefined}
                  />
                ) : (
                  <PreviewFallback simulatorType={item.simulatorType} />
                )}
              </div>

              <div className="space-y-3 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="line-clamp-2 text-base font-semibold text-slate-900">
                      {item.name}
                    </h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {formatSimulatorLabel(item.simulatorType)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Updated {formatDate(item.updatedAt)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`${ROUTE_BY_SIMULATOR[item.simulatorType]}?model=${item.id}`}
                    className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.name)}
                    disabled={deletingId === item.id}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
