"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePreviewUploadQueue } from "@/components/providers/PreviewUploadProvider";
import { Download } from "lucide-react";

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
  exportUsername = null,
  exportSlug = null,
  canEditCurrentModel = true,
  getPayload,
  getPreviewChart,
  onSaved,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mountedRef = useRef(true);
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { enqueuePreviewUpload } = usePreviewUploadQueue();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const callbackPath = buildCallbackPath(pathname, searchParams);
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const canEditExistingModel = Boolean(savedSimulationId && canEditCurrentModel);
  const exportBaseHref =
    sessionUser && canEditCurrentModel && savedSimulationId
      ? `/api/saved-simulations/${savedSimulationId}/export`
      : exportUsername && exportSlug
        ? `/api/public-models/${encodeURIComponent(exportUsername)}/${encodeURIComponent(exportSlug)}/export`
        : savedSimulationId
        ? `/api/saved-simulations/${savedSimulationId}/export`
        : null;
  const exportConfigHref = exportBaseHref ? `${exportBaseHref}/config` : null;
  const exportNativeBundleHref = exportBaseHref
    ? `${exportBaseHref}/native-bundle`
    : null;

  const updateBrowserUrl = (savedSimulation) => {
    if (sessionUser?.username && savedSimulation?.slug) {
      router.replace(
        `/-/${encodeURIComponent(sessionUser.username)}/${encodeURIComponent(savedSimulation.slug)}`,
        { scroll: false },
      );
      return;
    }

    if (!savedSimulation?.id) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("model", savedSimulation.id);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
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
      const isCreate = mode === "create";
      const isUpdateRequest = !isCreate && canEditExistingModel;
      const shouldUploadPreview = mode === "create" || mode === "image";
      const body = isUpdateRequest
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
        isUpdateRequest
          ? `/api/saved-simulations/${savedSimulationId}`
          : "/api/saved-simulations",
        {
          method: isUpdateRequest ? "PATCH" : "POST",
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
      const previewChart = shouldUploadPreview ? getPreviewChart?.() : null;
      if (previewChart) {
        enqueuePreviewUpload({
          savedSimulationId: saved.id,
          chart: previewChart,
        });
      }

      onSaved?.(saved);
      if (mountedRef.current) {
        updateBrowserUrl(saved);
        setSuccess(
          mode === "create"
            ? "Saved new model. Preview uploading in background."
            : mode === "image"
              ? "Saved changes. Preview uploading in background."
              : "Saved changes.",
        );
      }
    } catch (saveError) {
      if (mountedRef.current) {
        setError(saveError.message || "Failed to save simulation.");
      }
    } finally {
      if (mountedRef.current) {
        setPendingAction("");
      }
    }
  };

  return (
    <div className="border-t border-slate-300 px-3 py-3">
      {!sessionUser ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <span>Sign in to save this model to your account.</span>
            <Link
              href={loginHref}
              className="rounded bg-blue-900 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Login to Save
            </Link>
          </div>

          {exportBaseHref && (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
              <span>Download this model as JSON or as a native runner bundle.</span>
              <div className="flex flex-wrap gap-2">
                <a
                  href={exportConfigHref}
                  download
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <span className="flex items-center gap-1.5"><Download className="w-4 h-4" />JSON Config</span>
                </a>
                <a
                  href={exportNativeBundleHref}
                  download
                  className="rounded border border-blue-800 bg-white px-3 py-2 text-sm font-medium text-blue-900 transition hover:bg-blue-50"
                >
                  <span className="flex items-center gap-1.5"><Download className="w-4 h-4" />Run locally with C++</span>
                </a>
              </div>
            </div>
          )}
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
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-700"
              />
            </div>

            <div className="flex gap-2 md:self-end">
              <button
                type="button"
                onClick={() => persistSimulation("create")}
                disabled={pendingAction !== ""}
                className="rounded bg-blue-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "create" ? "Saving..." : "Save New"}
              </button>

              {canEditExistingModel && (
                <>
                  <button
                    type="button"
                    onClick={() => persistSimulation("update")}
                    disabled={pendingAction !== ""}
                    className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "update" ? "Updating..." : "Update"}
                  </button>
                  <button
                    type="button"
                    onClick={() => persistSimulation("image")}
                    disabled={pendingAction !== ""}
                    className="rounded border border-blue-800 px-3 py-2 text-sm font-medium text-blue-900 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "image" ? "Setting Image..." : "Set Image"}
                  </button>
                </>
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

          {exportBaseHref && (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
              <span>Download this model as JSON or as a native runner bundle.</span>
              <div className="flex flex-wrap gap-2">
                <a
                  href={exportConfigHref}
                  download
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <span className="flex items-center gap-1.5"><Download className="w-4 h-4" />JSON Config</span>
                </a>
                <a
                  href={exportNativeBundleHref}
                  download
                  className="rounded border border-blue-800 bg-white px-3 py-2 text-sm font-medium text-blue-900 transition hover:bg-blue-50"
                >
                  <span className="flex items-center gap-1.5"><Download className="w-4 h-4" />Run locally with C++</span>
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
