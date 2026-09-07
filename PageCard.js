"use client";

import { useState } from "react";
import {
  Lock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  FileText,
  X,
} from "lucide-react";
import ImageWithLoader from "@/components/ImageWithLoader";

export default function PageCard({
  page,
  isOwner,
  isEditMode,
  onClick,
  onPrefetch,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) {
  const [deletePrime, setDeletePrime] = useState(false);
  const isOptimistic = Boolean(page._optimistic);

  function handleOpenPage() {
    if (isOptimistic) return;
    onClick?.();
  }

  function handlePrefetch() {
    if (isOptimistic) return;
    onPrefetch?.();
  }

  return (
    <div
      className={`group relative transition-opacity duration-300 ${isOptimistic ? "opacity-75" : "opacity-100"}`}
      onMouseLeave={() => setDeletePrime(false)}
    >
      <button
        type="button"
        disabled={isOptimistic}
        onClick={handleOpenPage}
        onMouseEnter={handlePrefetch}
        onFocus={handlePrefetch}
        onTouchStart={handlePrefetch}
        className={`w-full text-left p-2 pb-[3px]  rounded-[4px] border-[3px] border-neutral-900/30 bg-white/70 shadow-md h-full transition-colors duration-150 ${
          isOptimistic
            ? "cursor-default"
            : "cursor-pointer group-hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-neutral-700"
        }`}
        aria-label={`Open page: ${page.title}`}
        aria-disabled={isOptimistic}
      >
        {page.thumbnail || page.blurDataURL ? (
          <div
            className="w-full aspect-[4/3] mb-1 rounded-sm shadow-md overflow-hidden relative"
            style={{
              backgroundImage: page.blurDataURL
                ? `url("${page.blurDataURL}")`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundColor: !page.blurDataURL ? "#cccccc" : undefined,
            }}
          >
            {page.thumbnail && (
              <ImageWithLoader
                src={page.thumbnail}
                alt={page.title}
                blurDataURL={page.blurDataURL}
                fill
                className="object-cover"
              />
            )}
          </div>
        ) : (
          <div className="w-full aspect-[4/3] shadow-sm mb-1 rounded-sm bg-zinc-200/50 flex items-center justify-center">
            <FileText className="w-8 h-8 text-neutral-500" />
          </div>
        )}

        <div className="flex pl-1 pr-1 items-center justify-between gap-1 h-8 w-full overflow-hidden">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {page.isPrivate && isOwner && (
              <Lock
                size={12}
                className="text-neutral-600 shrink-0"
                aria-label="Private page"
              />
            )}
            <h3
              className="min-w-0 flex-1 font-bold text-black/90 group-hover:text-black text-sm leading-snug line-clamp-2 break-words"
              title={page.title}
            >
              {page.title}
            </h3>
          </div>

          {page.description && (
            <p className="shrink-0 max-w-[45%] text-xs text-neutral-700/80 text-right leading-snug line-clamp-2">
              {page.description}
            </p>
          )}
        </div>
      </button>

      {isOwner && isEditMode && !isOptimistic && (
        <>
          <div className="absolute bottom-[10px] left-[10px] flex gap-1 opacity-70 group-hover:opacity-100 transition-all duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(page);
              }}
              className="group p-2 rounded-[3px] bg-neutral-700/70 shadow-md hover:bg-neutral-700/90"
              aria-label="Edit page"
            >
              <Pencil className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
            </button>
          </div>

          <div className="absolute top-[10px] right-[10px] flex gap-1 opacity-70 group-hover:opacity-100 transition-all duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!deletePrime) {
                  setDeletePrime(true);
                } else {
                  onDelete(page);
                  setDeletePrime(false);
                }
              }}
              className={`group p-2 rounded-[3px] shadow-md ${
                deletePrime
                  ? "bg-[#610e19]/90 hover:bg-[#610e19]/100"
                  : "bg-[#610e19]/40 hover:bg-[#610e19]/60"
              }`}
              aria-label="Delete page"
            >
              {deletePrime ? (
                <X className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
              ) : (
                <Trash2 className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
              )}
            </button>
          </div>
        </>
      )}

      {isOwner && isEditMode && !isOptimistic && (
        <div className="absolute bottom-1/2 translate-y-1/2 w-full px-[10px] flex justify-between opacity-70 group-hover:opacity-100 transition-all duration-200">
          {!isFirst && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMoveUp(page);
              }}
              className="group p-[2px] rounded-[2px] shadow-sm mb-3 bg-neutral-700/70 hover:bg-neutral-700/90"
              aria-label="Move page up"
            >
              <ChevronLeft className="w-7 h-7 text-neutral-100/70 group-hover:text-neutral-100/90" />
            </button>
          )}
          {isFirst && <div />}
          {!isLast && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMoveDown(page);
              }}
              className="group p-[2px] rounded-[2px] shadow-sm mt-3 bg-neutral-700/70 hover:bg-neutral-700/90"
              aria-label="Move page down"
            >
              <ChevronRight className="w-7 h-7 text-neutral-100/70 group-hover:text-neutral-100/90" />
            </button>
          )}
        </div>
      )}

      {isOptimistic && (
        <div className="absolute inset-0 rounded-[4px] bg-black/10 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-neutral-200/50 border-t-white/70 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
