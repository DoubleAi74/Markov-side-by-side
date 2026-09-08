// Shared shape constants for community profile cards. Imported by both the
// browser-side image encoder and the server-side validator, so keep this file
// free of any server-only dependency.

export const PROFILE_IMAGE_SIZE = 400;
export const PROFILE_IMAGE_MIME_TYPES = ["image/webp", "image/jpeg"];
export const MAX_PROFILE_IMAGE_BYTES = 256 * 1024;

/**
 * A user is on the community dashboard once they have saved a model, unless
 * they have opted out. Absent flag means visible, so existing accounts need no
 * migration.
 */
export function isCommunityVisible(user) {
  return user?.communityHidden !== true;
}

export function toPublicProfileImage(profileImage) {
  if (!profileImage?.imageUrl) {
    return null;
  }

  return {
    imageUrl: profileImage.imageUrl,
    blurDataURL: profileImage.blurDataURL ?? null,
    width: Number.isFinite(profileImage.width) ? profileImage.width : null,
    height: Number.isFinite(profileImage.height) ? profileImage.height : null,
    updatedAt:
      profileImage.updatedAt instanceof Date
        ? profileImage.updatedAt.toISOString()
        : (profileImage.updatedAt ?? null),
  };
}
