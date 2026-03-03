"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { normalizeAppPath } from "@/lib/auth/redirects";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function LoginForm({ callbackUrl = "/dashboard" }) {
  const [method, setMethod] = useState("magic");
  const [passwordMode, setPasswordMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const safeCallbackUrl = normalizeAppPath(callbackUrl, "/dashboard");

  const handleMagicLinkSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setPending(true);
    setError("");

    try {
      const response = await signIn("resend", {
        email: normalizedEmail,
        redirect: false,
        redirectTo: safeCallbackUrl,
      });

      if (!response?.ok || response.error) {
        setError(response?.error || "Failed to send sign-in link.");
        return;
      }

      setSentTo(normalizedEmail);
    } catch (submitError) {
      setError(submitError.message || "Failed to send sign-in link.");
    } finally {
      setPending(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (passwordMode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError("");
    setSentTo("");

    try {
      if (passwordMode === "register") {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            password,
          }),
        });

        if (!registerResponse.ok) {
          const data = await registerResponse.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create password account.");
        }
      }

      const signInResponse = await signIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false,
        redirectTo: safeCallbackUrl,
      });

      if (!signInResponse?.ok || signInResponse.error) {
        throw new Error(
          signInResponse?.error === "CredentialsSignin"
            ? "Invalid email or password."
            : signInResponse?.error || "Failed to sign in.",
        );
      }

      window.location.href = signInResponse.url || safeCallbackUrl;
    } catch (submitError) {
      setError(submitError.message || "Failed to sign in.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Login
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Use a magic link or sign in with an email and password.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => {
            setMethod("magic");
            setError("");
            setSentTo("");
          }}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            method === "magic"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Magic Link
        </button>
        <button
          type="button"
          onClick={() => {
            setMethod("password");
            setError("");
            setSentTo("");
          }}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            method === "password"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Password
        </button>
      </div>

      {method === "magic" && sentTo ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Sign-in link sent to <span className="font-semibold">{sentTo}</span>.
          Open the email and follow the link to continue.
        </div>
      ) : method === "magic" ? (
        <form className="mt-6 space-y-4" onSubmit={handleMagicLinkSubmit}>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Sending Link..." : "Send Sign-In Link"}
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setPasswordMode("signin");
                setError("");
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                passwordMode === "signin"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setPasswordMode("register");
                setError("");
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                passwordMode === "register"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Create Password
            </button>
          </div>

          <div>
            <label
              htmlFor="password-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Email Address
            </label>
            <input
              id="password-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={
                passwordMode === "register" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          {passwordMode === "register" && (
            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm your password"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? passwordMode === "register"
                ? "Creating Account..."
                : "Signing In..."
              : passwordMode === "register"
                ? "Create Password Account"
                : "Sign In"}
          </button>

          {passwordMode === "register" && (
            <p className="text-xs leading-relaxed text-slate-500">
              If this email already has magic-link access but no password yet,
              this will attach password login to that account.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
