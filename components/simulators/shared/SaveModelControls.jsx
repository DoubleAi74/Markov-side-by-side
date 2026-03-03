"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

function buildCallbackPath(pathname, searchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function SaveModelControls({
  sessionUser,
  simulatorType,
  modelName,
  onModelNameChange,
  savedSimulationId,
  getPayload,
  onSaved,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const callbackPath = buildCallbackPath(pathname, searchParams);
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;

  const updateBrowserUrl = (savedId) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("model", savedId);
    const nextUrl = `${pathname}?${nextParams.toString()}`;
    router.replace(nextUrl, { scroll: false });
  };

  const persistSimulation = async (mode) => {
    const trimmedName = String(modelName ?? "").trim();
    if (!trimmedName) {
      setError("Model name is required.");
      setSuccess("");
      return;
    }

    setPendingAction(mode);
    setError("");
    setSuccess("");

    try {
      const serialized = getPayload();
      const isUpdate = mode === "update" && savedSimulationId;
      const body = isUpdate
        ? {
            name: trimmedName,
            payloadVersion: serialized.payloadVersion,
            payload: serialized.payload,
          }
        : {
            name: trimmedName,
            description: "",
            simulatorType,
            payloadVersion: serialized.payloadVersion,
            payload: serialized.payload,
          };

      const response = await fetch(
        isUpdate
          ? `/api/saved-simulations/${savedSimulationId}`
          : "/api/saved-simulations",
        {
          method: isUpdate ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save simulation.");
      }

      const saved = await response.json();
      onSaved?.(saved);
      updateBrowserUrl(saved.id);
      setSuccess(mode === "update" ? "Saved changes." : "Saved new model.");
    } catch (saveError) {
      setError(saveError.message || "Failed to save simulation.");
    } finally {
      setPendingAction("");
    }
  };

  return (
    <div className="border-t border-slate-300 px-3 py-3">
      {!sessionUser ? (
        <div className="flex flex-col gap-2 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <span>Sign in to save this model to your account.</span>
          <Link
            href={loginHref}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Login to Save
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex-1">
              <label
                htmlFor={`${simulatorType}-model-name`}
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                Model Name
              </label>
              <input
                id={`${simulatorType}-model-name`}
                type="text"
                value={modelName}
                onChange={(event) => onModelNameChange(event.target.value)}
                placeholder="My saved model"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-2 md:self-end">
              <button
                type="button"
                onClick={() => persistSimulation("create")}
                disabled={pendingAction !== ""}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "create" ? "Saving..." : "Save New"}
              </button>

              {savedSimulationId && (
                <button
                  type="button"
                  onClick={() => persistSimulation("update")}
                  disabled={pendingAction !== ""}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingAction === "update" ? "Updating..." : "Update"}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs md:flex-row md:items-center md:justify-between">
            <span className="text-slate-500">
              Signed in as {sessionUser.email || "authenticated user"}
            </span>

            <div className="min-h-4" aria-live="polite">
              {error && <span className="text-red-700">{error}</span>}
              {!error && success && <span className="text-emerald-700">{success}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
