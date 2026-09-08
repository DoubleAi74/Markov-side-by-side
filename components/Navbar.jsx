"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { UserRound } from "lucide-react";
import { ACCOUNT_USERNAME_UPDATED_EVENT } from "@/lib/auth/events";
import {
  publishProfileUpdated,
  subscribeProfileUpdated,
} from "@/lib/community/events";
import ProfileImageControl from "@/components/community/ProfileImageControl";
import { useSimulatorTypeLabel } from "@/components/providers/SimulatorTypeProvider";
import {
  ACCOUNT_DELETION_PHRASE,
  matchesDeletionPhrase,
} from "@/lib/account/deletion";

const HOME_LINK = { href: "/", label: "Home" };
const COMMUNITY_LINK = { href: "/community", label: "Community" };
const EXAMPLE_LINKS = [
  { href: "/examples/food-chain", label: "CTMC Gillespie" },
  { href: "/examples/seasonal-lotka-volterra", label: "CTMP Time Var" },
  { href: "/examples/stochastic-lotka-volterra", label: "SDE Solver" },
  { href: "/examples/galton-watson", label: "Discrete Time" },
];
const PROFILE_TOGGLE_SELECTOR = '[data-profile-toggle="true"]';
const EXAMPLES_TOGGLE_SELECTOR = '[data-examples-toggle="true"]';

export default function Navbar({ sessionUser = null }) {
  const pathname = usePathname();
  const router = useRouter();
  const simulatorLabel = useSimulatorTypeLabel();
  const [menuOpen, setMenuOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [currentUsername, setCurrentUsername] = useState(
    sessionUser?.username ?? "",
  );
  const [draftUsername, setDraftUsername] = useState(
    sessionUser?.username ?? "",
  );
  const [savingUsername, setSavingUsername] = useState(false);
  const [profileImage, setProfileImage] = useState(
    sessionUser?.profileImage ?? null,
  );
  const [communityHidden, setCommunityHidden] = useState(
    sessionUser?.communityHidden === true,
  );
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteDialogRef = useRef(null);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const examplesMenuRef = useRef(null);
  const profileMenuRef = useRef(null);

  const closeDeleteDialog = () => {
    setDeleteOpen(false);
    setDeleteConfirmation("");
    setDeleteError("");
  };

  useEffect(() => {
    setCurrentUsername(sessionUser?.username ?? "");
    setDraftUsername(sessionUser?.username ?? "");
  }, [sessionUser?.username]);

  useEffect(() => {
    setProfileImage(sessionUser?.profileImage ?? null);
    setCommunityHidden(sessionUser?.communityHidden === true);
  }, [sessionUser?.profileImage, sessionUser?.communityHidden]);

  useEffect(
    () =>
      subscribeProfileUpdated((profile) => {
        if (!profile) return;
        setProfileImage(profile.profileImage ?? null);
        setCommunityHidden(profile.communityHidden === true);
      }),
    [],
  );

  useEffect(() => {
    if (!profileOpen) {
      return;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (profileMenuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(PROFILE_TOGGLE_SELECTOR)) {
        return;
      }
      setProfileOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!examplesOpen) {
      return;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (examplesMenuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(EXAMPLES_TOGGLE_SELECTOR)) {
        return;
      }
      setExamplesOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setExamplesOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [examplesOpen]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;

    if (deleteOpen && !dialog.open) {
      dialog.showModal();
    } else if (!deleteOpen && dialog.open) {
      dialog.close();
    }
  }, [deleteOpen]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut({ redirectTo: "/", redirect: true });
    } finally {
      setSigningOut(false);
      setMenuOpen(false);
    }
  };

  const handleOpenProfile = () => {
    setProfileOpen((prev) => !prev);
    setMenuOpen(false);
    setExamplesOpen(false);
    setSettingsError("");
    setSettingsSuccess("");
    setDeleteOpen(false);
    setDeleteConfirmation("");
  };

  const handleOpenExamples = () => {
    setExamplesOpen((prev) => !prev);
    setProfileOpen(false);
  };

  const handleUsernameSubmit = async (event) => {
    event.preventDefault();
    setSavingUsername(true);
    setSettingsError("");
    setSettingsSuccess("");

    try {
      const previousUsername = currentUsername;
      const response = await fetch("/api/account/username", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: draftUsername }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update username.");
      }

      const data = await response.json();
      const nextUsername = data.username ?? "";
      setCurrentUsername(nextUsername);
      setDraftUsername(nextUsername);
      setSettingsSuccess("Username updated.");

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(ACCOUNT_USERNAME_UPDATED_EVENT, {
            detail: { username: nextUsername },
          }),
        );
      }

      if (
        previousUsername &&
        pathname.startsWith(`/-/${previousUsername}`)
      ) {
        const nextPathname = pathname.replace(
          `/-/${previousUsername}`,
          `/-/${nextUsername}`,
        );
        router.replace(nextPathname);
      } else {
        router.refresh();
      }
    } catch (error) {
      setSettingsError(error.message || "Failed to update username.");
    } finally {
      setSavingUsername(false);
    }
  };

  const handleToggleCommunity = async () => {
    const nextHidden = !communityHidden;
    setSavingVisibility(true);
    setSettingsError("");
    setSettingsSuccess("");

    try {
      const response = await fetch("/api/account/community-visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: nextHidden }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update community visibility.");
      }

      const profile = await response.json();
      setCommunityHidden(profile.communityHidden === true);
      publishProfileUpdated(profile);
      setSettingsSuccess(
        profile.communityHidden
          ? "Hidden from the community page."
          : "Showing on the community page.",
      );
      router.refresh();
    } catch (error) {
      setSettingsError(error.message || "Failed to update community visibility.");
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!matchesDeletionPhrase(deleteConfirmation)) {
      return;
    }

    setDeletingAccount(true);
    setSettingsError("");
    setSettingsSuccess("");

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete the account.");
      }

      // The record is gone; drop the session cookie and leave the app.
      await signOut({ redirectTo: "/", redirect: true });
    } catch (error) {
      setDeleteError(error.message || "Failed to delete the account.");
      setDeletingAccount(false);
    }
  };

  const handleSendPasswordReset = async () => {
    setSendingResetEmail(true);
    setSettingsError("");
    setSettingsSuccess("");

    try {
      if (!sessionUser?.email) {
        throw new Error("Email address is missing from your account.");
      }

      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: sessionUser.email,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send reset email.");
      }

      setSettingsSuccess("Password reset link sent to your email.");
    } catch (error) {
      setSettingsError(error.message || "Failed to send reset email.");
    } finally {
      setSendingResetEmail(false);
    }
  };

  const renderProfileButton = () => (
    <button
      type="button"
      data-profile-toggle="true"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={handleOpenProfile}
      aria-label="Open profile settings"
      aria-expanded={profileOpen}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
        profileOpen
          ? "border-blue-800 bg-blue-900 text-white"
          : "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0"
        />
      </svg>
    </button>
  );

  return (
    <nav className="sticky top-0 z-50 h-14 bg-slate-900 text-white shadow-md relative">
      <div className="max-w-[1400px] mx-auto px-4 h-full flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2 pr-3">
          <Link
            href="/"
            className="shrink-0 text-base md:text-lg font-bold tracking-tight text-white hover:text-blue-300 transition"
            onClick={() => {
              setMenuOpen(false);
              setExamplesOpen(false);
              setProfileOpen(false);
            }}
          >
            Markov Lab
          </Link>
          {simulatorLabel ? (
            <span className="flex min-w-0 items-center gap-2 text-slate-300">
              <span className="hidden text-slate-500 sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="truncate text-xs font-medium sm:text-sm sm:font-semibold">
                {simulatorLabel}
              </span>
            </span>
          ) : null}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link
            href={HOME_LINK.href}
            onClick={() => {
              setExamplesOpen(false);
              setProfileOpen(false);
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
              pathname === HOME_LINK.href
                ? "bg-blue-900 text-white"
                : "text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {HOME_LINK.label}
          </Link>

          <div ref={examplesMenuRef} className="relative">
            <button
              type="button"
              data-examples-toggle="true"
              onClick={handleOpenExamples}
              aria-expanded={examplesOpen}
              aria-controls="desktop-examples-menu"
              aria-haspopup="true"
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                examplesOpen ||
                pathname.startsWith("/examples/") ||
                EXAMPLE_LINKS.some(({ href }) => pathname === href)
                  ? "bg-blue-900 text-white"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              Examples
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${
                  examplesOpen ? "rotate-180" : ""
                }`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 7.72a.75.75 0 0 1 1.06 0L10 11.44l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.78a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {examplesOpen && (
              <div
                id="desktop-examples-menu"
                className="absolute left-0 top-full mt-2 w-max min-w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl"
              >
                {EXAMPLE_LINKS.map(({ href, label }) => {
                  const isActive = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setExamplesOpen(false)}
                      className={`block whitespace-nowrap px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? "bg-blue-900 text-white"
                          : "text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href={COMMUNITY_LINK.href}
            onClick={() => {
              setExamplesOpen(false);
              setProfileOpen(false);
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
              pathname === COMMUNITY_LINK.href
                ? "bg-blue-900 text-white"
                : "text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {COMMUNITY_LINK.label}
          </Link>

          {sessionUser && currentUsername ? (
            <>
              <Link
                href={`/-/${encodeURIComponent(currentUsername)}`}
                onClick={() => setProfileOpen(false)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                  pathname === `/-/${currentUsername}`
                    ? "bg-blue-900 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                Dashboard
              </Link>
              <div className="ml-2">
                {renderProfileButton()}
              </div>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setProfileOpen(false)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                pathname === "/login"
                  ? "bg-blue-900 text-white"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              Login
            </Link>
          )}
        </div>

        <div className="md:hidden flex items-center gap-2">
          {sessionUser && renderProfileButton()}
          <button
            type="button"
            className="flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition"
            onClick={() => {
              setMenuOpen((prev) => !prev);
              setExamplesOpen(false);
              setProfileOpen(false);
            }}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
          >
            {menuOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {sessionUser && profileOpen && (
        <div
          ref={profileMenuRef}
          className="absolute right-4 top-16 z-[60] max-h-[calc(100vh-5rem)] w-[320px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-xl backdrop-blur"
        >
          <div className="mb-3 border-b border-slate-700 pb-3">
            <p className="text-sm font-semibold text-white">Profile Settings</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {sessionUser.email || "authenticated user"}
            </p>
          </div>

          <form className="space-y-2" onSubmit={handleUsernameSubmit}>
            <label
              htmlFor="nav-profile-username"
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
            >
              Username
            </label>
            <input
              id="nav-profile-username"
              type="text"
              value={draftUsername}
              onChange={(event) => setDraftUsername(event.target.value)}
              placeholder="your-name"
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={savingUsername}
              className="w-full rounded-sm bg-blue-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingUsername ? "Saving Username..." : "Save Username"}
            </button>
          </form>

          <div className="mt-3 border-t border-slate-700 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Profile Picture
            </p>
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-600 bg-slate-800">
                {profileImage?.imageUrl ? (
                  <Image
                    key={profileImage.imageUrl}
                    src={profileImage.imageUrl}
                    alt="Your profile picture"
                    fill
                    sizes="56px"
                    className="object-cover"
                    placeholder={profileImage.blurDataURL ? "blur" : "empty"}
                    blurDataURL={profileImage.blurDataURL || undefined}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <UserRound
                      className="h-6 w-6 text-slate-500"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <ProfileImageControl
                  hasImage={Boolean(profileImage?.imageUrl)}
                  onDone={() => router.refresh()}
                />
              </div>
            </div>
          </div>

          <div className="mt-1 flex items-start justify-between gap-3 border-t border-slate-700 pt-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200">
                Show on community page
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                Your card appears once you save a model.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!communityHidden}
              aria-label="Show me on the community page"
              onClick={handleToggleCommunity}
              disabled={savingVisibility}
              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
                communityHidden ? "bg-slate-600" : "bg-blue-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  communityHidden ? "left-0.5" : "left-[18px]"
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            onClick={handleSendPasswordReset}
            disabled={sendingResetEmail}
            className="mt-3 w-full rounded-sm border border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sendingResetEmail ? "Sending Reset Link..." : "Change Password"}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-2 w-full rounded-sm border border-red-700/60 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? "Logging Out..." : "Logout"}
          </button>

          <div className="mt-3 min-h-4 text-xs" aria-live="polite">
            {settingsError && <p className="text-red-300">{settingsError}</p>}
            {!settingsError && settingsSuccess && (
              <p className="text-emerald-300">{settingsSuccess}</p>
            )}
          </div>

          <div className="mt-2 border-t border-slate-700 pt-3">
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmation("");
                setDeleteError("");
                setSettingsError("");
                setSettingsSuccess("");
                setDeleteOpen(true);
                setProfileOpen(false);
              }}
              className="w-full rounded-sm px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-red-950/40 hover:text-red-200"
            >
              Delete my account
            </button>
          </div>
        </div>
      )}

      <dialog
        ref={deleteDialogRef}
        onClose={closeDeleteDialog}
        onCancel={(event) => {
          if (deletingAccount) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !deletingAccount) {
            closeDeleteDialog();
          }
        }}
        aria-labelledby="delete-account-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-6">
          <h2
            id="delete-account-title"
            className="text-lg font-bold tracking-tight text-red-200"
          >
            This cannot be undone.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Your account, saved models, preview images and profile picture are
            permanently deleted.
          </p>

          <label
            htmlFor="delete-account-confirm"
            className="mt-5 block text-sm text-slate-300"
          >
            Type{" "}
            <span className="font-semibold text-red-200">
              {ACCOUNT_DELETION_PHRASE}
            </span>{" "}
            to confirm
          </label>
          <input
            id="delete-account-confirm"
            type="text"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={deletingAccount}
            placeholder={ACCOUNT_DELETION_PHRASE}
            className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-900/60 disabled:opacity-60 placeholder:text-slate-600"
          />

          <div className="mt-3 min-h-4 text-xs" aria-live="polite">
            {deleteError && <p className="text-red-300">{deleteError}</p>}
          </div>

          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={closeDeleteDialog}
              disabled={deletingAccount}
              className="flex-1 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={
                deletingAccount || !matchesDeletionPhrase(deleteConfirmation)
              }
              className="flex-1 rounded-lg bg-red-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {deletingAccount ? "Deleting..." : "Delete forever"}
            </button>
          </div>
        </div>
      </dialog>

      {menuOpen && (
        <div
          id="mobile-nav-menu"
          className="md:hidden absolute top-14 left-0 right-0 bg-slate-800 shadow-lg border-t border-slate-700 z-50"
        >
          <Link
            href={HOME_LINK.href}
            onClick={() => {
              setMenuOpen(false);
              setProfileOpen(false);
            }}
            className={`block px-4 py-3 text-sm font-medium border-b border-slate-700 transition ${
              pathname === HOME_LINK.href
                ? "bg-blue-900 text-white"
                : "text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {HOME_LINK.label}
          </Link>

          <button
            type="button"
            data-examples-toggle="true"
            onClick={handleOpenExamples}
            aria-expanded={examplesOpen}
            aria-controls="mobile-examples-menu"
            className={`flex w-full items-center justify-between border-b border-slate-700 px-4 py-3 text-sm font-medium transition ${
              examplesOpen ||
              pathname.startsWith("/examples/") ||
              EXAMPLE_LINKS.some(({ href }) => pathname === href)
                ? "bg-blue-900 text-white"
                : "text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            Examples
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${
                examplesOpen ? "rotate-180" : ""
              }`}
            >
              <path
                fillRule="evenodd"
                d="M5.22 7.72a.75.75 0 0 1 1.06 0L10 11.44l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.78a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {examplesOpen && (
            <div id="mobile-examples-menu" className="bg-slate-900/40">
              {EXAMPLE_LINKS.map(({ href, label }) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => {
                      setMenuOpen(false);
                      setExamplesOpen(false);
                      setProfileOpen(false);
                    }}
                    className={`block border-b border-slate-700 py-3 pl-8 pr-4 text-sm font-medium transition ${
                      isActive
                        ? "bg-blue-950 text-white"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          )}

          <Link
            href={COMMUNITY_LINK.href}
            onClick={() => {
              setMenuOpen(false);
              setProfileOpen(false);
            }}
            className={`block px-4 py-3 text-sm font-medium border-b border-slate-700 transition ${
              pathname === COMMUNITY_LINK.href
                ? "bg-blue-900 text-white"
                : "text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {COMMUNITY_LINK.label}
          </Link>

          {sessionUser && currentUsername ? (
            <>
              <Link
                href={`/-/${encodeURIComponent(currentUsername)}`}
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(false);
                }}
                className={`block px-4 py-3 text-sm font-medium border-b border-slate-700 transition ${
                  pathname === `/-/${currentUsername}`
                    ? "bg-blue-900 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                Dashboard
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => {
                setMenuOpen(false);
                setProfileOpen(false);
              }}
              className={`block px-4 py-3 text-sm font-medium border-b border-slate-700 last:border-b-0 transition ${
                pathname === "/login"
                  ? "bg-blue-900 text-white"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              Login
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
