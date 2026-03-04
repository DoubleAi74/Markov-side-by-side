"use client";

import Link from "next/link";
import { useState } from "react";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function PasswordResetForm({
  initialEmail = "",
  initialToken = "",
}) {
  const [email, setEmail] = useState(initialEmail);
  const [token] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

  const hasToken = token.trim().length > 0;

  const handleRequestSubmit = async (event) => {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send password reset email.");
      }

      setRequestSent(true);
    } catch (submitError) {
      setError(submitError.message || "Failed to send password reset email.");
    } finally {
      setPending(false);
    }
  };

  const handleResetSubmit = async (event) => {
    event.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reset password.");
      }

      setResetComplete(true);
    } catch (submitError) {
      setError(submitError.message || "Failed to reset password.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {hasToken ? "Set a New Password" : "Reset Password"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {hasToken
            ? "Choose a new password for your account."
            : "Enter your email and we will send you a password reset link."}
        </p>
      </div>

      {!hasToken && requestSent ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            If an account exists for <span className="font-semibold">{email.trim()}</span>,
            a password reset link has been sent.
          </div>
          <Link
            href="/login"
            className="inline-flex text-sm font-semibold text-indigo-600 transition hover:text-indigo-500"
          >
            Back to login
          </Link>
        </div>
      ) : hasToken && resetComplete ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Your password has been updated. You can now log in with your new
            password.
          </div>
          <Link
            href="/login"
            className="inline-flex text-sm font-semibold text-indigo-600 transition hover:text-indigo-500"
          >
            Go to login
          </Link>
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={hasToken ? handleResetSubmit : handleRequestSubmit}
        >
          {!hasToken && (
            <div>
              <label
                htmlFor="reset-email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Email Address
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
              />
            </div>
          )}

          {hasToken && (
            <>
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                />
              </div>
            </>
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
              ? hasToken
                ? "Saving Password..."
                : "Sending Reset Link..."
              : hasToken
                ? "Save New Password"
                : "Send Reset Link"}
          </button>

          <Link
            href="/login"
            className="inline-flex text-sm font-semibold text-indigo-600 transition hover:text-indigo-500"
          >
            Back to login
          </Link>
        </form>
      )}
    </div>
  );
}
