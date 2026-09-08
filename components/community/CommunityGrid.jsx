"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CommunityCard from "@/components/community/CommunityCard";
import { subscribeProfileUpdated } from "@/lib/community/events";

export default function CommunityGrid({
  initialMembers = [],
  viewerId = null,
  viewerIsMember = false,
}) {
  const [members, setMembers] = useState(initialMembers);

  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  // Reflect the viewer's own edits immediately, wherever they were made.
  useEffect(() => {
    if (!viewerId) return undefined;

    return subscribeProfileUpdated((profile) => {
      if (!profile?.id) return;

      setMembers((current) => {
        if (profile.communityHidden) {
          return current.filter((member) => member.id !== profile.id);
        }
        return current.map((member) =>
          member.id === profile.id
            ? { ...member, profileImage: profile.profileImage ?? null }
            : member,
        );
      });
    });
  }, [viewerId]);

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        No one has shared a model yet. Save one and your card appears here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {members.map((member) => (
          <CommunityCard
            key={member.id}
            member={member}
            isOwner={Boolean(viewerId) && member.id === viewerId}
          />
        ))}
      </div>

      {viewerId && !viewerIsMember && (
        <p className="text-sm text-slate-500">
          You are not on this page yet.{" "}
          <Link href="/" className="font-semibold text-blue-900 hover:underline">
            Save your first model
          </Link>{" "}
          and your card appears automatically.
        </p>
      )}
    </div>
  );
}
