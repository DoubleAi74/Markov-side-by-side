"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Pencil, UserRound, X } from "lucide-react";
import ProfileImageControl from "@/components/community/ProfileImageControl";

const CARD_IMAGE_SIZES =
  "(min-width: 1024px) 220px, (min-width: 640px) 30vw, 45vw";

function formatModelCount(count) {
  return `${count} ${count === 1 ? "model" : "models"}`;
}

export default function CommunityCard({ member, isOwner = false }) {
  const [editing, setEditing] = useState(false);
  const preview = member.profileImage;

  return (
    <div className="group relative">
      <Link
        href={`/-/${encodeURIComponent(member.username)}`}
        className="block w-full overflow-hidden rounded-[4px] bg-white text-left shadow-sm transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-700"
        aria-label={`Open @${member.username} (${formatModelCount(member.modelCount)})`}
      >
        <div className="rounded-t-[4px] border border-b-0 border-neutral-200 p-1.5 pb-0">
          <div
            className="relative aspect-square w-full overflow-hidden rounded-sm bg-zinc-200/50 shadow-sm"
            style={
              preview?.blurDataURL
                ? {
                    backgroundImage: `url("${preview.blurDataURL}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            {preview?.imageUrl ? (
              <Image
                src={preview.imageUrl}
                alt={`@${member.username}`}
                fill
                sizes={CARD_IMAGE_SIZES}
                className="object-cover"
                placeholder={preview.blurDataURL ? "blur" : "empty"}
                blurDataURL={preview.blurDataURL || undefined}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <UserRound
                  className="h-10 w-10 text-neutral-400"
                  aria-hidden="true"
                />
              </div>
            )}
          </div>

          <div className="flex h-8 w-full items-center gap-1 overflow-hidden px-0.5">
            <h3
              className="min-w-0 flex-1 truncate text-xs font-bold leading-tight text-black/90 group-hover:text-black"
              title={`@${member.username}`}
            >
              @{member.username}
            </h3>
            <span className="shrink-0 text-[11px] leading-tight text-neutral-500">
              {formatModelCount(member.modelCount)}
            </span>
          </div>
        </div>

        <div className="h-[4.8px] bg-[#157C94] opacity-20 transition-opacity duration-150 group-hover:opacity-70" />
      </Link>

      {isOwner && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit your profile picture"
          className="absolute right-[10px] top-[10px] rounded-[3px] bg-slate-900/50 p-2 text-white opacity-0 shadow-md transition hover:bg-slate-900/80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {isOwner && editing && (
        <div className="absolute inset-x-1.5 top-1.5 bottom-auto z-10 flex aspect-square flex-col items-center justify-center gap-2 rounded-sm bg-slate-900/85 p-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Close picture editor"
            className="absolute right-1.5 top-1.5 rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <ProfileImageControl
            hasImage={Boolean(preview?.imageUrl)}
            variant="card"
            onDone={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}
