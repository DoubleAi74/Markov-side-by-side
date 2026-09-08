// Shared by the confirmation UI and the server-side guard, so both compare
// against exactly the same phrase.
export const ACCOUNT_DELETION_PHRASE = "delete my account";

export function matchesDeletionPhrase(value) {
  return (
    typeof value === "string" &&
    value.trim().toLowerCase() === ACCOUNT_DELETION_PHRASE
  );
}
