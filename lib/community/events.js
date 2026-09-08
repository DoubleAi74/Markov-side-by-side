export const PROFILE_UPDATED_EVENT = "community-profile-updated";

/**
 * Lets every mounted copy of the profile controls (navbar dropdown, own card
 * on the community grid) stay in sync after one of them saves.
 */
export function publishProfileUpdated(profile) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { profile } }),
  );
}

export function subscribeProfileUpdated(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail?.profile ?? null);
  window.addEventListener(PROFILE_UPDATED_EVENT, listener);
  return () => window.removeEventListener(PROFILE_UPDATED_EVENT, listener);
}
