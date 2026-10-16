import { createKeyring, importMasterKey, type Keyring } from "@freelyforms/crypto";
import type { Env } from "./env.js";

let cached: { secret: string; keyring: Promise<Keyring> } | undefined;

/** Keyring from Worker secrets, cached per isolate. */
export function keyringFor(env: Env): Promise<Keyring> {
  if (cached?.secret !== env.MASTER_KEY_K1) {
    cached = {
      secret: env.MASTER_KEY_K1,
      keyring: importMasterKey("k1", env.MASTER_KEY_K1).then((k) => createKeyring(k)),
    };
  }
  return cached.keyring;
}
