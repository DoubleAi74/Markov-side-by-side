"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SavedSimulationList from "@/components/dashboard/SavedSimulationList";
import NewModelModal from "@/components/dashboard/NewModelModal";
import { ACCOUNT_USERNAME_UPDATED_EVENT } from "@/lib/auth/events";

export default function UserDashboardShell({
  ownerUsername,
  ownerUserId = null,
  initialItems = [],
  isOwner = false,
  sessionEmail = null,
}) {
  const router = useRouter();
  const [profileUsername, setProfileUsername] = useState(ownerUsername);

  useEffect(() => {
    setProfileUsername(ownerUsername);
  }, [ownerUsername]);

  useEffect(() => {
    if (!isOwner) return;

    const handleUsernameUpdated = (event) => {
      const nextUsername = event.detail?.username;
      if (typeof nextUsername === "string" && nextUsername !== profileUsername) {
        setProfileUsername(nextUsername);
        router.replace(`/-/${encodeURIComponent(nextUsername)}`);
      }
    };

    window.addEventListener(
      ACCOUNT_USERNAME_UPDATED_EVENT,
      handleUsernameUpdated,
    );

    return () =>
      window.removeEventListener(
        ACCOUNT_USERNAME_UPDATED_EVENT,
        handleUsernameUpdated,
      );
  }, [isOwner, profileUsername, router]);

  useEffect(() => {
    if (!isOwner) return;

    const refreshSavedModels = () => router.refresh();
    window.addEventListener("focus", refreshSavedModels);
    return () => window.removeEventListener("focus", refreshSavedModels);
  }, [isOwner, router]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 md:py-12 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            @{profileUsername}
          </h1>
          {isOwner && sessionEmail ? (
            <p className="text-sm text-slate-500">
              Signed in as {sessionEmail}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Saved simulations</p>
          )}
        </div>

        {isOwner && <NewModelModal />}
      </header>

      <SavedSimulationList
        initialItems={initialItems}
        profileUsername={profileUsername}
        ownerUserId={ownerUserId}
        allowDelete={isOwner}
      />
    </div>
  );
}
