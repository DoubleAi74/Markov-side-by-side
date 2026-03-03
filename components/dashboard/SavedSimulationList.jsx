"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const ROUTE_BY_SIMULATOR = {
  gillespie: "/gillespie",
  "ctmp-inhomo": "/ctmp-inhomo",
  sde: "/sde",
};

function formatDate(value) {
  if (!value) return "Unknown";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return "Unknown";
  }
}

function formatSimulatorLabel(simulatorType) {
  if (simulatorType === "gillespie") return "CTMC Gillespie";
  if (simulatorType === "ctmp-inhomo") return "CTMP Time Var";
  return "SDE Solver";
}

export default function SavedSimulationList({ initialItems = [] }) {
  const [items, setItems] = useState(initialItems);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

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
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {sortedItems.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {item.name}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {formatSimulatorLabel(item.simulatorType)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Updated {formatDate(item.updatedAt)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`${ROUTE_BY_SIMULATOR[item.simulatorType]}?model=${item.id}`}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
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
        </div>
      ))}
    </div>
  );
}
