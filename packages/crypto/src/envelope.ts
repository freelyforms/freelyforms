/**
 * Envelope encryption with the Web Crypto API (works in Cloudflare Workers, browsers and Node.js).
 *
 * Each payload gets a fresh random 256-bit data key. The payload is encrypted with the data key
 * (AES-256-GCM), and the data key is encrypted ("wrapped") with a master key that lives outside
 * the database (a Worker secret or KMS). Deleting an envelope therefore deletes its data key too.
 *
 * Optional associated data binds a ciphertext to its context (for example a submission ID or a
 * user ID), so an envelope copied to another row fails to decrypt.
 */

const ENVELOPE_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;

/** Web Crypto key, typed without depending on DOM or Node.js type libraries. */
type CryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export interface MasterKey {
  readonly id: string;
  readonly key: CryptoKey;
}

/** Master keys by ID. `current` encrypts; every key in `keys` can decrypt (for rotation). */
export interface Keyring {
  readonly current: MasterKey;
  readonly keys: ReadonlyMap<string, MasterKey>;
}

/** Serialisable envelope. All binary fields are base64url without padding. */
export interface Envelope {
  readonly v: typeof ENVELOPE_VERSION;
  /** Master key ID used to wrap the data key. */
  readonly kid: string;
  /** IV + wrapped data key. */
  readonly dk: string;
  /** IV + ciphertext of the payload. */
  readonly ct: string;
}

export class EnvelopeError extends Error {
  override readonly name = "EnvelopeError";
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new EnvelopeError("Malformed envelope");
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  } catch {
    throw new EnvelopeError("Malformed envelope");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

async function seal(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    plaintext,
  );
  return concat(iv, new Uint8Array(ct));
}

async function open(
  key: CryptoKey,
  sealed: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (sealed.length <= IV_BYTES) throw new EnvelopeError("Malformed envelope");
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: sealed.subarray(0, IV_BYTES), additionalData: aad },
      key,
      sealed.subarray(IV_BYTES),
    );
    return new Uint8Array(pt);
  } catch {
    // Wrong key, wrong associated data or tampering: never reveal which.
    throw new EnvelopeError("Decryption failed");
  }
}

/** Associated data for wrapping: binds the data key to the envelope version and master key ID. */
const wrapAad = (kid: string) => encoder.encode(`ff-envelope:v${String(ENVELOPE_VERSION)}:${kid}`);

/** Imports a 32-byte master key given as base64 or base64url (for example from a Worker secret). */
export async function importMasterKey(id: string, secret: string): Promise<MasterKey> {
  if (!KEY_ID.test(id)) throw new EnvelopeError("Master key ID must match [A-Za-z0-9_-]{1,32}");
  const raw = fromBase64Url(
    secret.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  );
  if (raw.length !== KEY_BYTES) throw new EnvelopeError("Master key must be 32 bytes");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  raw.fill(0);
  return { id, key };
}

/** Builds a keyring. The first key encrypts; all keys can decrypt. */
export function createKeyring(current: MasterKey, ...previous: MasterKey[]): Keyring {
  const keys = new Map<string, MasterKey>();
  for (const k of [current, ...previous]) {
    if (keys.has(k.id)) throw new EnvelopeError(`Duplicate master key ID ${k.id}`);
    keys.set(k.id, k);
  }
  return { current, keys };
}

/** Generates a new random master key encoded as base64url (for provisioning secrets). */
export function generateMasterKeySecret(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

/** Encrypts bytes or UTF-8 text into an envelope. */
export async function encrypt(
  keyring: Keyring,
  plaintext: Uint8Array | string,
  associatedData = "",
): Promise<Envelope> {
  const { id: kid, key: master } = keyring.current;
  const rawDataKey = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  try {
    const dataKey = await crypto.subtle.importKey("raw", rawDataKey, "AES-GCM", false, ["encrypt"]);
    const body =
      typeof plaintext === "string" ? encoder.encode(plaintext) : new Uint8Array(plaintext);
    const ct = await seal(dataKey, body, encoder.encode(associatedData));
    const dk = await seal(master, rawDataKey, wrapAad(kid));
    return { v: ENVELOPE_VERSION, kid, dk: toBase64Url(dk), ct: toBase64Url(ct) };
  } finally {
    rawDataKey.fill(0);
  }
}

/** Decrypts an envelope to bytes. Throws `EnvelopeError` on any failure. */
export async function decrypt(
  keyring: Keyring,
  envelope: Envelope,
  associatedData = "",
): Promise<Uint8Array> {
  // Envelopes come from storage, so the version is checked at runtime despite its type.
  if ((envelope as { v: unknown }).v !== ENVELOPE_VERSION)
    throw new EnvelopeError("Unsupported envelope version");
  const master = keyring.keys.get(envelope.kid);
  if (!master) throw new EnvelopeError("Unknown master key");
  const rawDataKey = await open(master.key, fromBase64Url(envelope.dk), wrapAad(envelope.kid));
  try {
    if (rawDataKey.length !== KEY_BYTES) throw new EnvelopeError("Decryption failed");
    const dataKey = await crypto.subtle.importKey("raw", rawDataKey, "AES-GCM", false, ["decrypt"]);
    return await open(dataKey, fromBase64Url(envelope.ct), encoder.encode(associatedData));
  } finally {
    rawDataKey.fill(0);
  }
}

/** Decrypts an envelope that holds UTF-8 text. */
export async function decryptText(
  keyring: Keyring,
  envelope: Envelope,
  associatedData = "",
): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await decrypt(keyring, envelope, associatedData),
  );
}

/** Re-wraps an envelope's data key with the keyring's current master key (rotation). */
export async function rewrap(keyring: Keyring, envelope: Envelope): Promise<Envelope> {
  if (envelope.kid === keyring.current.id) return envelope;
  const old = keyring.keys.get(envelope.kid);
  if (!old) throw new EnvelopeError("Unknown master key");
  const rawDataKey = await open(old.key, fromBase64Url(envelope.dk), wrapAad(envelope.kid));
  try {
    const dk = await seal(keyring.current.key, rawDataKey, wrapAad(keyring.current.id));
    return { ...envelope, kid: keyring.current.id, dk: toBase64Url(dk) };
  } finally {
    rawDataKey.fill(0);
  }
}
