"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { ACCOUNT_USERNAME_UPDATED_EVENT } from "@/lib/auth/events";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/gillespie", label: "Reaction network" },
  { href: "/ctmp-inhomo", label: "Time-dependent" },
  { href: "/sde", label: "SDE" },
];
const PROFILE_TOGGLE_SELECTOR = '[data-profile-toggle="true"]';

export default function Navbar({ sessionUser = null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [currentUsername, setCurrentUsername] = useState(
    sessionUser?.username ?? "",
  );
  const [draftUsername, setDraftUsername] = useState(
    sessionUser?.username ?? "",
  );
  const [savingUsername, setSavingUsername] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const profileMenuRef = useRef(null);

  useEffect(() => {
    setCurrentUsername(sessionUser?.username ?? "");
    setDraftUsername(sessionUser?.username ?? "");
  }, [sessionUser?.username]);

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
    setSettingsError("");
    setSettingsSuccess("");
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
        <Link
          href="/"
          className="text-base md:text-lg font-bold tracking-tight text-white hover:text-blue-300 transition"
          onClick={() => {
            setMenuOpen(false);
            setProfileOpen(false);
          }}
        >
          <span className="brand-mark" aria-hidden="true">M</span> Markov Lab
        </Link>

        <div className="hidden md:flex items-center gap-2">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setProfileOpen(false)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                  isActive
                    ? "bg-blue-900 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}

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
          className="absolute right-4 top-16 z-[60] w-[320px] rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-xl backdrop-blur"
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

          <button
            type="button"
            onClick={handleSendPasswordReset}
            disabled={sendingResetEmail}
            className="mt-2 w-full rounded-sm border border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>
      )}

      {menuOpen && (
        <div
          id="mobile-nav-menu"
          className="md:hidden absolute top-14 left-0 right-0 bg-slate-800 shadow-lg border-t border-slate-700 z-50"
        >
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(false);
                }}
                className={`block px-4 py-3 text-sm font-medium border-b border-slate-700 last:border-b-0 transition ${
                  isActive
                    ? "bg-blue-900 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}

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
