"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { normalizeAppPath } from "@/lib/auth/redirects";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function ErrorNotice({ error }) {
  if (!error) {
    return null;
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  );
}

function MagicLinkNotice({ sentTo }) {
  if (!sentTo) {
    return null;
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      Sign-in link sent to <span className="font-semibold">{sentTo}</span>.
      Open the email and follow the link to continue.
    </div>
  );
}

export default function LoginForm({ callbackUrl = "/dashboard" }) {
  const [tab, setTab] = useState("login");
  const [loginMode, setLoginMode] = useState("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const safeCallbackUrl = normalizeAppPath(callbackUrl, "/dashboard");

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setLoginMode("password");
    setPassword("");
    setError("");
    setSentTo("");
  };

  const showMagicLinkMode = () => {
    setLoginMode("magic");
    setPassword("");
    setError("");
    setSentTo("");
  };

  const showPasswordLoginMode = () => {
    setLoginMode("password");
    setPassword("");
    setError("");
    setSentTo("");
  };

  const handleMagicLinkSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setPending(true);
    setError("");
    setSentTo("");

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

  const handlePasswordLoginSubmit = async (event) => {
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

    setPending(true);
    setError("");
    setSentTo("");

    try {
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

  const handleSignupSubmit = async (event) => {
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

    setPending(true);
    setError("");
    setSentTo("");

    try {
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
        throw new Error(data.error || "Failed to create account.");
      }

      const signInResponse = await signIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false,
        redirectTo: safeCallbackUrl,
      });

      if (!signInResponse?.ok || signInResponse.error) {
        throw new Error(signInResponse?.error || "Account created, but sign-in failed.");
      }

      window.location.href = signInResponse.url || safeCallbackUrl;
    } catch (submitError) {
      setError(submitError.message || "Failed to create account.");
    } finally {
      setPending(false);
    }
  };

  const heading = tab === "signup" ? "Create Your Account" : "Login";
  const subheading =
    tab === "signup"
      ? "Create an account with your email and password."
      : loginMode === "magic"
        ? "Enter your email to receive a magic sign-in link."
        : "Sign in with your password or switch to a magic link.";

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "login"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => switchTab("signup")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "signup"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Signup
          </button>
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
          {heading}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {subheading}
        </p>
      </div>

      {tab === "signup" ? (
        <form className="mt-6 space-y-4" onSubmit={handleSignupSubmit}>
          <div>
            <label
              htmlFor="signup-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Email Address
            </label>
            <input
              id="signup-email"
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
              htmlFor="signup-password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          <ErrorNotice error={error} />

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Creating Account..." : "Sign Up"}
          </button>
        </form>
      ) : loginMode === "magic" ? (
        <form className="mt-6 space-y-4" onSubmit={handleMagicLinkSubmit}>
          <div>
            <label
              htmlFor="magic-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Email Address
            </label>
            <input
              id="magic-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          <MagicLinkNotice sentTo={sentTo} />
          <ErrorNotice error={error} />

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Sending Link..." : "Send Link"}
          </button>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={showPasswordLoginMode}
              className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-500"
            >
              Back to password login
            </button>
          </div>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handlePasswordLoginSubmit}>
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Email Address
            </label>
            <input
              id="login-email"
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
              htmlFor="login-password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end">
            <Link
              href={`/reset-password${
                email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""
              }`}
              className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-500"
            >
              Forgot password?
            </Link>
          </div>

          <ErrorNotice error={error} />

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Signing In..." : "Sign In"}
          </button>

          <p className="text-center text-sm font-medium text-slate-400">or</p>

          <button
            type="button"
            onClick={showMagicLinkMode}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Sign in with Magic Link
          </button>
        </form>
      )}
    </div>
  );
}
