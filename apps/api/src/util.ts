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

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID: 48-bit millisecond time + 80 random bits, Crockford base32, sortable by time. */
export function ulid(now: number): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (const b of crypto.getRandomValues(new Uint8Array(16))) rand += CROCKFORD.charAt(b % 32);
  return time + rand;
}

/** Form IDs match `frm_[A-Za-z0-9]{6,32}` (form schema); 12 characters ≈ 71 bits. */
export function newFormId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (const b of crypto.getRandomValues(new Uint8Array(24))) {
    if (b < 248) id += alphabet.charAt(b % 62);
    if (id.length === 12) break;
  }
  return id.length === 12 ? `frm_${id}` : newFormId();
}
