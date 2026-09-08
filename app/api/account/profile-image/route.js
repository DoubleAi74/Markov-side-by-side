import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  clearUserProfileImage,
  getCommunityProfile,
  setUserProfileImage,
} from "@/lib/community/service";
import {
  CommunityValidationError,
  validateProfileImageUploadInput,
} from "@/lib/community/validators";
import {
  buildProfileImageObjectKey,
  deleteProfileImageObject,
  getProfileImagePublicUrl,
  uploadProfileImage,
} from "@/lib/storage/r2";

export const runtime = "nodejs";

async function getSessionUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new CommunityValidationError("Request body must be valid JSON.");
  }
}

function errorResponse(error, fallback) {
  if (error instanceof CommunityValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(
    { error: error.message || fallback },
    { status: 500 },
  );
}

// A user can only ever write their own image: the key is derived from the
// session id, never from the request body.
export async function PUT(request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const existing = await getCommunityProfile(sessionUser.id);
    if (!existing) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const upload = validateProfileImageUploadInput(await readJson(request));
    const objectKey = buildProfileImageObjectKey({
      userId: sessionUser.id,
      contentType: upload.format,
    });

    await uploadProfileImage({
      objectKey,
      body: upload.image.buffer,
      contentType: upload.format,
    });

    let updated;
    try {
      updated = await setUserProfileImage(sessionUser.id, {
        imageUrl: getProfileImagePublicUrl(objectKey),
        blurDataURL: upload.blurDataURL,
        objectKey,
        width: upload.width,
        height: upload.height,
        format: upload.format,
        fileSize: upload.fileSize,
        updatedAt: new Date(),
      });
    } catch (error) {
      deleteProfileImageObject(objectKey).catch(() => {});
      throw error;
    }

    if (!updated) {
      deleteProfileImageObject(objectKey).catch(() => {});
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (
      existing.profileImageObjectKey &&
      existing.profileImageObjectKey !== objectKey
    ) {
      deleteProfileImageObject(existing.profileImageObjectKey).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error, "Failed to upload profile image.");
  }
}

export async function DELETE() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const existing = await getCommunityProfile(sessionUser.id);
    if (!existing) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const cleared = await clearUserProfileImage(sessionUser.id);
    if (existing.profileImageObjectKey) {
      deleteProfileImageObject(existing.profileImageObjectKey).catch(() => {});
    }

    return NextResponse.json(cleared);
  } catch (error) {
    return errorResponse(error, "Failed to remove profile image.");
  }
}
