/**
 * "Use this template" on the website links to /app/?template=<slug>. The slug survives the Google
 * sign-in round trip in sessionStorage; the form is created only when the owner confirms.
 */
const KEY = "ff_template";

export function pendingTemplate(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("template");
  if (fromUrl && /^[a-z0-9-]{1,60}$/.test(fromUrl)) {
    try {
      sessionStorage.setItem(KEY, fromUrl);
    } catch {
      // Private mode: the slug is still in the URL until sign-in.
    }
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingTemplate(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
  const url = new URL(window.location.href);
  if (url.searchParams.has("template")) {
    url.searchParams.delete("template");
    window.history.replaceState(null, "", url);
  }
}

/** "contact-form" → "Contact form". */
export const templateName = (slug: string) =>
  slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
