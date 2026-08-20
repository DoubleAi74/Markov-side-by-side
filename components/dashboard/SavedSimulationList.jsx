"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Trash2, X, Activity, Search, Grid2X2, List } from "lucide-react";
import { SAVED_SIMULATION_PREVIEW_UPDATED_EVENT } from "@/lib/previews/events";

const ROUTE_BY_SIMULATOR = {
  gillespie: "/gillespie",
  "ctmp-inhomo": "/ctmp-inhomo",
  sde: "/sde",
};

const CARD_IMAGE_SIZES =
  "(min-width: 1280px) 240px, (min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw";


function formatSimulatorLabel(simulatorType) {
  if (simulatorType === "gillespie") return "CTMC Gillespie";
  if (simulatorType === "ctmp-inhomo") return "CTMP Time Var";
  return "SDE Solver";
}

function buildModelHref(item, profileUsername) {
  if (item?.visibility !== "private" && profileUsername && item?.slug) {
    return `/-/${encodeURIComponent(profileUsername)}/${encodeURIComponent(item.slug)}`;
  }

  return `${ROUTE_BY_SIMULATOR[item.simulatorType]}?model=${item.id}`;
}

function SimulationCard({ item, profileUsername, allowDelete, onDelete, deletingId }) {
  const [deletePrime, setDeletePrime] = useState(false);
  const isDeleting = deletingId === item.id;
  const preview = item.preview ?? null;

  return (
    <div
      className={`group relative transition-opacity duration-300 ${isDeleting ? "opacity-50 pointer-events-none" : "opacity-100"}`}
      onMouseLeave={() => setDeletePrime(false)}
    >
      <Link
        href={buildModelHref(item, profileUsername)}
        className="block w-full text-left p-2 pb-[3px] rounded-[4px] border border-neutral-200 bg-white shadow-md hover:shadow-lg transition-shadow duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-700"
        aria-label={`Open ${item.name}`}
      >
        {preview?.imageUrl ? (
          <div
            className="w-full aspect-[4/3] mb-1 rounded-sm shadow-md overflow-hidden relative"
            style={{
              backgroundImage: preview.blurDataURL
                ? `url("${preview.blurDataURL}")`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundColor: !preview.blurDataURL ? "#cccccc" : undefined,
            }}
          >
            <Image
              src={preview.imageUrl}
              alt={`${item.name} preview`}
              fill
              sizes={CARD_IMAGE_SIZES}
              className="object-cover"
              placeholder={preview.blurDataURL ? "blur" : "empty"}
              blurDataURL={preview.blurDataURL || undefined}
            />
          </div>
        ) : (
          <div className="w-full aspect-[4/3] shadow-sm mb-1 rounded-sm bg-zinc-200/50 flex items-center justify-center">
            <Activity className="w-8 h-8 text-neutral-500" />
          </div>
        )}

        <div className="flex pl-1 pr-1 items-center justify-between gap-1 h-8 w-full overflow-hidden">
          <h2
            className="min-w-0 flex-1 font-bold text-black/90 group-hover:text-black text-sm leading-snug line-clamp-2 break-words"
            title={item.name}
          >
            {item.name}
          </h2>
          <span className="shrink-0 text-xs text-neutral-500 text-right leading-snug">
            {item.visibility === "private" ? "Private · " : ""}{formatSimulatorLabel(item.simulatorType)}
          </span>
        </div>
      </Link>

      {allowDelete && (
        <div className="absolute top-[10px] right-[10px] flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!deletePrime) {
                setDeletePrime(true);
              } else {
                onDelete(item.id);
                setDeletePrime(false);
              }
            }}
            className={`group/del p-2 rounded-[3px] shadow-md transition-colors duration-150 ${
              deletePrime
                ? "bg-[#610e19]/90 hover:bg-[#610e19]"
                : "bg-[#610e19]/40 hover:bg-[#610e19]/60"
            }`}
            aria-label="Delete simulation"
          >
            {deletePrime ? (
              <X className="w-4 h-4 text-neutral-100/70 group-hover/del:text-neutral-100" />
            ) : (
              <Trash2 className="w-4 h-4 text-neutral-100/70 group-hover/del:text-neutral-100" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SavedSimulationList({
  initialItems = [],
  profileUsername = null,
  allowDelete = true,
}) {
  const [items, setItems] = useState(initialItems);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [solver, setSolver] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState("grid");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

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
      items.filter((item) => {
        const matchesQuery = !query.trim() || `${item.name} ${item.description || ""} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase());
        return matchesQuery && (solver === "all" || item.simulatorType === solver) && (visibility === "all" || item.visibility === visibility);
      }).sort((a, b) => {
        if (sort === "name") return String(a.name).localeCompare(String(b.name));
        if (sort === "created") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        const aTime = new Date(a.updatedAt || 0).getTime();
        const bTime = new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      }),
    [items, query, solver, sort, visibility],
  );

  const handleDelete = async (id) => {
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

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        No saved simulations yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="dashboard-toolbar" role="search" aria-label="Filter saved models">
        <label className="dashboard-search"><span className="sr-only">Search models</span><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models, descriptions, or tags" /></label>
        <label><span className="sr-only">Solver</span><select value={solver} onChange={(event) => setSolver(event.target.value)}><option value="all">All solvers</option><option value="gillespie">Gillespie SSA</option><option value="ctmp-inhomo">Time-dependent CTMP</option><option value="sde">SDE</option></select></label>
        <label><span className="sr-only">Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="all">Public & private</option><option value="public">Public only</option><option value="private">Private only</option></select></label>
        <label><span className="sr-only">Sort models</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="name">Name A–Z</option></select></label>
        <div className="dashboard-view-switch" aria-label="Model layout"><button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 /></button><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="List view"><List /></button></div>
      </div>
      {allowDelete && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {sortedItems.length === 0 && <p className="rounded border border-dashed border-slate-400 p-8 text-center text-sm text-slate-600">No models match these filters.</p>}
      <div className={view === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" : "dashboard-list-view"}>
        {sortedItems.map((item) => (
          <SimulationCard
            key={item.id}
            item={item}
            profileUsername={profileUsername}
            allowDelete={allowDelete}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        ))}
      </div>
    </div>
  );
}
