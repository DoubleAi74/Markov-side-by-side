"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, X, Activity } from "lucide-react";
import { SAVED_SIMULATION_PREVIEW_UPDATED_EVENT } from "@/lib/previews/events";
import {
  SAVED_SIMULATION_TAB_EVENT,
  publishSavedSimulationDeleted,
  subscribeSavedSimulationTabEvents,
} from "@/lib/saved-simulations/tab-sync";

const ROUTE_BY_SIMULATOR = {
  gillespie: "/gillespie",
  "ctmp-inhomo": "/ctmp-inhomo",
  sde: "/sde",
  "discrete-time": "/discrete-time",
};

const CARD_IMAGE_SIZES =
  "(min-width: 1280px) 240px, (min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw";


function formatSimulatorLabel(simulatorType) {
  if (simulatorType === "gillespie") return "CTMC Gillespie";
  if (simulatorType === "ctmp-inhomo") return "CTMP Time Var";
  if (simulatorType === "sde") return "SDE Solver";
  if (simulatorType === "discrete-time") return "Discrete Time";
  return "Unknown";
}

function buildModelHref(item, profileUsername) {
  if (profileUsername && item?.slug) {
    return `/-/${encodeURIComponent(profileUsername)}/${encodeURIComponent(item.slug)}`;
  }

  return `${ROUTE_BY_SIMULATOR[item.simulatorType]}?model=${item.id}`;
}

// Measures the title at the base text-sm size via a hidden clone, so the
// smaller font never feeds back into the measurement. The title box keeps a
// stable width because the simulator label next to it is shrink-0.
function useMultilineTitle(name) {
  const measureRef = useRef(null);
  const [isMultiline, setIsMultiline] = useState(false);

  useEffect(() => {
    const el = measureRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const update = () => {
      const style = window.getComputedStyle(el);
      const lineHeight =
        parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25;
      setIsMultiline(el.getBoundingClientRect().height > lineHeight * 1.5);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);

  return { measureRef, isMultiline };
}

function SimulationCard({ item, profileUsername, allowDelete, onDelete, deletingId }) {
  const [deletePrime, setDeletePrime] = useState(false);
  const isDeleting = deletingId === item.id;
  const preview = item.preview ?? null;
  const { measureRef, isMultiline } = useMultilineTitle(item.name);

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

        <div className="flex min-h-10 w-full items-start justify-between gap-2 px-1 py-1.5">
          <div className="relative min-w-0 flex-1">
            <span
              ref={measureRef}
              aria-hidden="true"
              className="invisible absolute inset-x-0 top-0 text-sm font-bold leading-tight break-words"
            >
              {item.name}
            </span>
            <h2
              className={`font-bold leading-tight text-black/90 line-clamp-2 break-words group-hover:text-black ${
                isMultiline ? "text-xs" : "text-sm"
              }`}
              title={item.name}
            >
              {item.name}
            </h2>
          </div>
          <span className="mt-px max-w-[42%] shrink-0 text-right text-[11px] leading-tight text-neutral-500">
            {formatSimulatorLabel(item.simulatorType)}
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

function upsertSavedSimulation(current, savedSimulation) {
  if (!savedSimulation?.id) {
    return current;
  }

  const index = current.findIndex((item) => item.id === savedSimulation.id);
  if (index === -1) {
    return [savedSimulation, ...current];
  }

  const next = [...current];
  next[index] = {
    ...next[index],
    ...savedSimulation,
    preview: savedSimulation.preview ?? next[index].preview ?? null,
  };
  return next;
}

export default function SavedSimulationList({
  initialItems = [],
  profileUsername = null,
  ownerUserId = null,
  allowDelete = true,
}) {
  const [items, setItems] = useState(initialItems);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const handlePreviewUpdated = (event) => {
      const savedSimulation = event.detail?.savedSimulation;
      if (!savedSimulation?.id) {
        return;
      }

      setItems((current) => upsertSavedSimulation(current, savedSimulation));
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

  useEffect(() => {
    if (!ownerUserId) {
      return undefined;
    }

    return subscribeSavedSimulationTabEvents((event) => {
      if (event.userId !== ownerUserId) {
        return;
      }

      if (event.type === SAVED_SIMULATION_TAB_EVENT.DELETED) {
        setItems((current) =>
          current.filter((item) => item.id !== event.id),
        );
        return;
      }

      if (event.type === SAVED_SIMULATION_TAB_EVENT.UPSERTED) {
        setItems((current) =>
          upsertSavedSimulation(current, event.savedSimulation),
        );
      }
    });
  }, [ownerUserId]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aTime = new Date(a.updatedAt || 0).getTime();
        const bTime = new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      }),
    [items],
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
      if (ownerUserId) {
        publishSavedSimulationDeleted({
          userId: ownerUserId,
          id,
        });
      }
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete saved simulation.");
    } finally {
      setDeletingId(null);
    }
  };

  if (sortedItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        No saved simulations yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allowDelete && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
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
