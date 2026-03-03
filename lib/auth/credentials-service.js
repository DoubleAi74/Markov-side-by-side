import "server-only";
import connectToDatabase from "@/lib/db/mongoose";
import UserCredential from "@/models/UserCredential";
import {
  AuthConflictError,
  AuthInputError,
  hashPassword,
  normalizeEmail,
  normalizePassword,
  verifyPassword,
} from "@/lib/auth/passwords";
import {
  createAuthUser,
  findAuthUserByEmail,
  findAuthUserById,
} from "@/lib/auth/users";

function toAuthUser(user) {
  if (!user?._id || !user?.email) {
    return null;
  }

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
  };
}

export async function registerPasswordAccount({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(password);

  await connectToDatabase();

  const existingCredential = await UserCredential.findOne({
    email: normalizedEmail,
  }).lean();

  if (existingCredential) {
    throw new AuthConflictError(
      "Password login is already enabled for this email.",
    );
  }

  let authUser = await findAuthUserByEmail(normalizedEmail);
  if (!authUser) {
    authUser = await createAuthUser({ email: normalizedEmail });
  }

  const passwordHash = await hashPassword(normalizedPassword);

  await UserCredential.create({
    userId: authUser._id,
    email: normalizedEmail,
    passwordHash,
  });

  return toAuthUser(authUser);
}

export async function authorizePasswordLogin({ email, password }) {
  const normalizedEmail = normalizeEmail(email);

  if (typeof password !== "string" || password.length === 0) {
    return null;
  }

  await connectToDatabase();

  const credential = await UserCredential.findOne({
    email: normalizedEmail,
  }).lean();

  if (!credential) {
    return null;
  }

  const passwordMatches = await verifyPassword(password, credential.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  let authUser = await findAuthUserById(credential.userId.toString());
  if (!authUser) {
    authUser = await findAuthUserByEmail(normalizedEmail);
  }

  return toAuthUser(authUser);
}

export { AuthConflictError, AuthInputError };
