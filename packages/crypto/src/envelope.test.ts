import { describe, expect, it } from "vitest";
import {
  createKeyring,
  decrypt,
  decryptText,
  encrypt,
  EnvelopeError,
  generateMasterKeySecret,
  importMasterKey,
  rewrap,
  type Envelope,
} from "./index.js";

const keyring = async (id = "k1") =>
  createKeyring(await importMasterKey(id, generateMasterKeySecret()));

/** Flips one character of a base64url string. */
const flip = (s: string, at: number): string =>
  s.slice(0, at) + (s[at] === "A" ? "B" : "A") + s.slice(at + 1);

describe("envelope encryption", () => {
  it("round-trips text and bytes", async () => {
    const ring = await keyring();
    const text = "Réponse — 回答 — 😀";
    expect(await decryptText(ring, await encrypt(ring, text))).toBe(text);
    const bytes = new Uint8Array([0, 1, 2, 255]);
    expect(await decrypt(ring, await encrypt(ring, bytes))).toEqual(bytes);
  });

  it("never contains the plaintext and uses a fresh data key and IV every time", async () => {
    const ring = await keyring();
    const a = await encrypt(ring, "secret answer");
    const b = await encrypt(ring, "secret answer");
    expect(JSON.stringify(a)).not.toContain("secret");
    expect(a.ct).not.toBe(b.ct);
    expect(a.dk).not.toBe(b.dk);
  });

  it("binds ciphertext to its associated data", async () => {
    const ring = await keyring();
    const env = await encrypt(ring, "token", "user:1");
    expect(await decryptText(ring, env, "user:1")).toBe("token");
    await expect(decrypt(ring, env, "user:2")).rejects.toThrow(EnvelopeError);
    await expect(decrypt(ring, env)).rejects.toThrow(EnvelopeError);
  });

  it("detects tampering with the ciphertext or the wrapped key", async () => {
    const ring = await keyring();
    const env = await encrypt(ring, "payload");
    await expect(decrypt(ring, { ...env, ct: flip(env.ct, 20) })).rejects.toThrow(
      "Decryption failed",
    );
    await expect(decrypt(ring, { ...env, dk: flip(env.dk, 20) })).rejects.toThrow(
      "Decryption failed",
    );
  });

  it("rejects a different master key with the same ID", async () => {
    const env = await encrypt(await keyring("k1"), "payload");
    await expect(decrypt(await keyring("k1"), env)).rejects.toThrow("Decryption failed");
  });

  it("rejects unknown key IDs, versions and malformed fields", async () => {
    const ring = await keyring();
    const env = await encrypt(ring, "payload");
    await expect(decrypt(ring, { ...env, kid: "other" })).rejects.toThrow("Unknown master key");
    await expect(decrypt(ring, { ...env, v: 2 } as unknown as Envelope)).rejects.toThrow(
      "Unsupported envelope version",
    );
    await expect(decrypt(ring, { ...env, ct: "!!" })).rejects.toThrow("Malformed envelope");
    await expect(decrypt(ring, { ...env, ct: "" })).rejects.toThrow("Malformed envelope");
  });

  it("supports key rotation: old envelopes decrypt and can be re-wrapped", async () => {
    const k1 = await importMasterKey("k1", generateMasterKeySecret());
    const k2 = await importMasterKey("k2", generateMasterKeySecret());
    const old = await encrypt(createKeyring(k1), "payload", "ctx");
    const rotated = createKeyring(k2, k1);
    expect(await decryptText(rotated, old, "ctx")).toBe("payload");

    const rewrapped = await rewrap(rotated, old);
    expect(rewrapped.kid).toBe("k2");
    expect(rewrapped.ct).toBe(old.ct);
    expect(await decryptText(createKeyring(k2), rewrapped, "ctx")).toBe("payload");
    expect((await encrypt(rotated, "new")).kid).toBe("k2");
  });

  it("validates master keys", async () => {
    await expect(importMasterKey("k1", "c2hvcnQ")).rejects.toThrow("32 bytes");
    await expect(importMasterKey("bad id", generateMasterKeySecret())).rejects.toThrow(
      "Master key ID",
    );
    const standardBase64 = Buffer.alloc(32, 7).toString("base64");
    await expect(importMasterKey("k1", standardBase64)).resolves.toMatchObject({ id: "k1" });
    const k = await importMasterKey("k1", generateMasterKeySecret());
    expect(() => createKeyring(k, k)).toThrow("Duplicate master key ID");
  });
});
