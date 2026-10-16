const encoder = new TextEncoder();

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random ID such as `usr_k3j9…` (20 characters from a 36-letter alphabet, ~103 bits). */
export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let id = "";
  // 252 is the largest multiple of 36 below 256; rejection keeps the distribution uniform.
  for (const b of bytes) if (b < 252) id += ID_ALPHABET.charAt(b % 36);
  return id.length >= 16 ? `${prefix}_${id.slice(0, 16)}` : newId(prefix);
}

export async function sha256Base64Url(text: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function decodeJwtPayload(jwt: string): unknown {
  const part = jwt.split(".")[1];
  if (part === undefined) throw new Error("Malformed JWT");
  return JSON.parse(decodeBase64UrlText(part));
}

export function decodeBase64UrlText(text: string): string {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}
