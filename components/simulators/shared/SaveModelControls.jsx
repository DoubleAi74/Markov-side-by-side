"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePreviewUploadQueue } from "@/components/providers/PreviewUploadProvider";
import { publishSavedSimulationUpserted } from "@/lib/saved-simulations/tab-sync";
import { ChevronDown, Download } from "lucide-react";

function buildCallbackPath(pathname, searchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

function filenameFromDisposition(header, fallback) {
  const match = String(header ?? "").match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SaveModelControls({
  sessionUser,
  simulatorType,
  modelName,
  onModelNameChange,
  savedSimulationId,
  canEditCurrentModel = true,
  getPayload,
  getPreviewChart,
  supportsNativeExport = true,
  onDownloadCsv,
  canDownloadCsv = false,
  onSaved,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mountedRef = useRef(true);
  const controlsRef = useRef(null);
  const modelNameInputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadPending, setDownloadPending] = useState("");
  const [downloadError, setDownloadError] = useState("");
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

  useEffect(() => {
    if (!menuOpen && !downloadOpen) return;

    const focusFrame = menuOpen
      ? window.requestAnimationFrame(() => {
          modelNameInputRef.current?.focus();
        })
      : null;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (target instanceof Node && !controlsRef.current?.contains(target)) {
        setMenuOpen(false);
        setDownloadOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setDownloadOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      if (focusFrame != null) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [downloadOpen, menuOpen]);

  const callbackPath = buildCallbackPath(pathname, searchParams);
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const canEditExistingModel = Boolean(savedSimulationId && canEditCurrentModel);

  const downloadLiveExport = async (kind) => {
    setDownloadError("");
    setDownloadPending(kind);

    try {
      const serialized = getPayload?.();
      if (!serialized?.payload) {
        throw new Error("Could not read the current model.");
      }

      const response = await fetch(
        kind === "native-bundle"
          ? "/api/exports/native-bundle"
          : "/api/exports/config",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String(modelName ?? "").trim() || "Untitled Model",
            simulatorType,
            payloadVersion: serialized.payloadVersion,
            payload: serialized.payload,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export the model.");
      }

      const blob = await response.blob();
      triggerBlobDownload(
        blob,
        filenameFromDisposition(
          response.headers.get("Content-Disposition"),
          kind === "native-bundle"
            ? "model-native-bundle.zip"
            : "model.json",
        ),
      );
      setDownloadOpen(false);
    } catch (exportError) {
      if (mountedRef.current) {
        setDownloadError(
          exportError.message || "Failed to export the model.",
        );
      }
    } finally {
      if (mountedRef.current) {
        setDownloadPending("");
      }
    }
  };

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
      if (sessionUser?.id && saved?.id) {
        publishSavedSimulationUpserted({
          userId: sessionUser.id,
          savedSimulation: saved,
        });
      }
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
    <div
      ref={controlsRef}
      className="ml-auto flex shrink-0 items-center gap-1.5"
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setDownloadOpen((current) => !current);
            setMenuOpen(false);
            setDownloadError("");
          }}
          aria-expanded={downloadOpen}
          aria-controls={`${simulatorType}-download-menu`}
          aria-haspopup="menu"
          className={`inline-flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold transition ${
            downloadOpen
              ? "border-slate-400 bg-slate-100 text-slate-900"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          Download
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              downloadOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {downloadOpen && (
          <div
            id={`${simulatorType}-download-menu`}
            role="menu"
            aria-label="Download"
            className="absolute top-full right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              disabled={!canDownloadCsv || Boolean(downloadPending)}
              title={
                canDownloadCsv ? undefined : "Run the simulation to download CSV"
              }
              onClick={() => {
                onDownloadCsv?.();
                setDownloadOpen(false);
              }}
              className={MENU_ITEM}
            >
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Download CSV
            </button>

            <button
              type="button"
              role="menuitem"
              disabled={Boolean(downloadPending)}
              aria-busy={downloadPending === "config"}
              onClick={() => downloadLiveExport("config")}
              className={MENU_ITEM}
            >
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {downloadPending === "config" ? "Preparing JSON..." : "JSON config"}
            </button>

            {supportsNativeExport && (
              <button
                type="button"
                role="menuitem"
                disabled={Boolean(downloadPending)}
                aria-busy={downloadPending === "native-bundle"}
                onClick={() => downloadLiveExport("native-bundle")}
                className={MENU_ITEM}
              >
                <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {downloadPending === "native-bundle"
                  ? "Preparing C++..."
                  : "Run locally with C++"}
              </button>
            )}

            {downloadError && (
              <p
                role="status"
                className="border-t border-slate-100 px-3 py-2 text-[11px] leading-snug text-red-700"
              >
                {downloadError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setMenuOpen((current) => !current);
            setDownloadOpen(false);
          }}
          aria-expanded={menuOpen}
          aria-controls={`${simulatorType}-save-popover`}
          aria-haspopup="dialog"
          className={`inline-flex min-w-20 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white transition ${
            menuOpen ? "bg-blue-800" : "bg-blue-900 hover:bg-blue-800"
          }`}
        >
          Save
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              menuOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {menuOpen && (
          <div
            id={`${simulatorType}-save-popover`}
            role="dialog"
            aria-label="Save model"
            className="absolute top-full right-0 z-40 mt-2 max-h-[calc(100vh-5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left shadow-2xl"
          >
            {!sessionUser ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Sign in to save this model to your account.
                </p>
                <Link
                  href={loginHref}
                  className="block w-full rounded bg-blue-900 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Login to Save
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor={`${simulatorType}-model-name`}
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Model Name
                  </label>
                  <input
                    ref={modelNameInputRef}
                    id={`${simulatorType}-model-name`}
                    type="text"
                    value={modelName}
                    onChange={(event) => onModelNameChange(event.target.value)}
                    placeholder="My saved model"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
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
                        {pendingAction === "image"
                          ? "Setting Image..."
                          : "Set Image"}
                      </button>
                    </>
                  )}
                </div>

                <div className="space-y-1 text-xs">
                  <p className="text-slate-500">
                    Signed in as {sessionUser.email || "authenticated user"}
                  </p>
                  <div className="min-h-4" aria-live="polite">
                    {error && <span className="text-red-700">{error}</span>}
                    {!error && success && (
                      <span className="text-emerald-700">{success}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
