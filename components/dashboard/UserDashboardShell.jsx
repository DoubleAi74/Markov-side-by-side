"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SavedSimulationList from "@/components/dashboard/SavedSimulationList";
import { ACCOUNT_USERNAME_UPDATED_EVENT } from "@/lib/auth/events";

export default function UserDashboardShell({
  ownerUsername,
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

  return (
    <div className="dashboard-shell mx-auto w-full max-w-[1400px] px-4 py-8 md:py-12 space-y-6">
      <header className="dashboard-heading space-y-1">
        <p className="eyebrow">{isOwner ? "Your research workspace" : "Public model collection"}</p>
        <h1>@{profileUsername}</h1>
        {isOwner && sessionEmail ? (
          <p className="text-sm text-slate-500">
            Models, forks, and reproducible starting points · signed in as {sessionEmail}
          </p>
        ) : (
          <p className="text-sm text-slate-500">Public stochastic models shared for inspection and reuse.</p>
        )}
      </header>

      <SavedSimulationList
        initialItems={initialItems}
        profileUsername={profileUsername}
        allowDelete={isOwner}
      />
    </div>
  );
}
