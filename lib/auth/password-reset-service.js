import "server-only";
import crypto from "node:crypto";
import connectToDatabase from "@/lib/db/mongoose";
import UserCredential from "@/models/UserCredential";
import PasswordResetToken from "@/models/PasswordResetToken";
import {
  AuthInputError,
  hashPassword,
  normalizeEmail,
  normalizePassword,
} from "@/lib/auth/passwords";
import { findAuthUserByEmail, findAuthUserById } from "@/lib/auth/users";

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;
const RESEND_EMAILS_API_URL = "https://api.resend.com/emails";

function getAppOrigin(origin) {
  if (process.env.AUTH_URL) {
    return process.env.AUTH_URL;
  }

  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }

  if (origin) {
    return origin;
  }

  throw new Error("Missing AUTH_URL environment variable.");
}

function buildResetUrl({ token, origin }) {
  const resetUrl = new URL("/reset-password", getAppOrigin(origin));
  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendPasswordResetEmail({ email, resetUrl }) {
  if (!process.env.AUTH_RESEND_KEY || !process.env.AUTH_EMAIL_FROM) {
    throw new Error(
      "Missing AUTH_RESEND_KEY or AUTH_EMAIL_FROM environment variable.",
    );
  }

  const safeEmail = escapeHtml(email);
  const safeResetUrl = escapeHtml(resetUrl);
  const response = await fetch(RESEND_EMAILS_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM,
      to: [email],
      subject: "Reset your password",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
          <p>Use the link below to reset the password for <strong>${safeEmail}</strong>.</p>
          <p>
            <a href="${safeResetUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 8px; background: #4f46e5; color: white; text-decoration: none; font-weight: 600;">
              Reset Password
            </a>
          </p>
          <p>If the button does not work, copy and paste this URL into your browser:</p>
          <p><a href="${safeResetUrl}">${safeResetUrl}</a></p>
          <p>This link expires in 1 hour.</p>
        </div>
      `,
      text: [
        `Reset the password for ${email}.`,
        "",
        `Open this link to continue: ${resetUrl}`,
        "",
        "This link expires in 1 hour.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.message || payload?.error?.message || "Failed to send email.";
    throw new Error(message);
  }
}

export async function requestPasswordReset({ email, origin }) {
  const normalizedEmail = normalizeEmail(email);

  await connectToDatabase();

  const authUser = await findAuthUserByEmail(normalizedEmail);
  if (!authUser?._id || !authUser?.email) {
    return { ok: true };
  }

  const resetToken = createResetToken();
  const tokenHash = hashResetToken(resetToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await PasswordResetToken.deleteMany({ email: normalizedEmail });
  await PasswordResetToken.create({
    userId: authUser._id.toString(),
    email: normalizedEmail,
    tokenHash,
    expiresAt,
  });

  const resetUrl = buildResetUrl({ token: resetToken, origin });
  await sendPasswordResetEmail({
    email: normalizedEmail,
    resetUrl,
  });

  return { ok: true };
}

export async function resetPasswordWithToken({ token, password }) {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new AuthInputError("Reset token is required.");
  }

  const normalizedPassword = normalizePassword(password);

  await connectToDatabase();

  const tokenHash = hashResetToken(token.trim());
  const resetToken = await PasswordResetToken.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
  });

  if (!resetToken) {
    throw new AuthInputError("This password reset link is invalid or has expired.");
  }

  const authUser =
    (await findAuthUserById(resetToken.userId.toString())) ||
    (await findAuthUserByEmail(resetToken.email));

  if (!authUser?._id || !authUser?.email) {
    throw new AuthInputError("This password reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(normalizedPassword);
  const existingCredential = await UserCredential.findOne({
    $or: [{ email: resetToken.email }, { userId: authUser._id.toString() }],
  });

  if (existingCredential) {
    existingCredential.userId = authUser._id.toString();
    existingCredential.email = authUser.email;
    existingCredential.passwordHash = passwordHash;
    await existingCredential.save();
  } else {
    await UserCredential.create({
      userId: authUser._id.toString(),
      email: authUser.email,
      passwordHash,
    });
  }

  await PasswordResetToken.deleteMany({
    $or: [{ email: authUser.email }, { userId: authUser._id.toString() }],
  });

  return {
    ok: true,
    email: authUser.email,
  };
}
