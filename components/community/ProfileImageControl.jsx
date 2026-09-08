"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import {
  ACCEPTED_UPLOAD_TYPES,
  encodeProfileImage,
} from "@/lib/community/imageEncoder";
import { publishProfileUpdated } from "@/lib/community/events";

/**
 * Shared upload/remove control for the signed-in user's own profile picture.
 * Rendered both in the navbar profile panel and on the user's own community
 * card; the server is the only authority on whose image is being written.
 */
export default function ProfileImageControl({
  hasImage = false,
  variant = "panel",
  onDone,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const compact = variant === "card";

  const send = async (method, body) => {
    const response = await fetch("/api/account/profile-image", {
      method,
      ...(body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Something went wrong. Try again.");
    }

    return response.json();
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy("upload");
    setError("");
    try {
      const encoded = await encodeProfileImage(file);
      const profile = await send("PUT", encoded);
      publishProfileUpdated(profile);
      onDone?.(profile);
    } catch (uploadError) {
      setError(uploadError.message || "Failed to update your picture.");
    } finally {
      setBusy("");
    }
  };

  const handleRemove = async () => {
    setBusy("remove");
    setError("");
    try {
      const profile = await send("DELETE");
      publishProfileUpdated(profile);
      onDone?.(profile);
    } catch (removeError) {
      setError(removeError.message || "Failed to remove your picture.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className={compact ? "flex flex-col items-center gap-1.5" : "space-y-2"}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES}
        onChange={handleFile}
        className="hidden"
      />

      <div className={compact ? "flex gap-1.5" : "flex gap-2"}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== ""}
          className={
            compact
              ? "inline-flex items-center gap-1.5 rounded-md bg-slate-900/85 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              : "inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-slate-600 px-2 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          }
        >
          {busy === "upload" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          )}
          {busy === "upload"
            ? "Uploading..."
            : hasImage
              ? "Change picture"
              : "Add picture"}
        </button>

        {hasImage && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy !== ""}
            aria-label="Remove profile picture"
            className={
              compact
                ? "inline-flex items-center justify-center rounded-md bg-slate-900/85 px-2 py-1.5 text-white shadow-sm transition hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-60"
                : "inline-flex shrink-0 items-center justify-center rounded-sm border border-red-700/60 px-2 py-2 text-red-200 transition hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {busy === "remove" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      <p
        className={
          error
            ? `text-xs ${compact ? "text-center text-red-100" : "text-red-300"}`
            : "sr-only"
        }
        aria-live="polite"
      >
        {error}
      </p>
    </div>
  );
}
