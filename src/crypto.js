// Ed25519 signing over canonical JSON. This is the provenance layer: every claim a
// business makes, every registry listing and every payment mandate is a signed object
// that any agent can verify without trusting the transport it arrived over.
import { generateKeyPairSync, sign, verify, createPublicKey, createHash } from "node:crypto";

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function newIdentity(label) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return { label, publicKey: pub, privateKey, fingerprint: fingerprint(pub) };
}

export function fingerprint(pubB64) {
  return "ed25519:" + createHash("sha256").update(pubB64).digest("hex").slice(0, 16);
}

/** Wrap a payload in an envelope signed by `identity`. */
export function signEnvelope(identity, payload) {
  const sig = sign(null, Buffer.from(canonical(payload)), identity.privateKey).toString("base64");
  return { payload, signer: identity.fingerprint, publicKey: identity.publicKey, signature: sig };
}

/** Verify an envelope. Optionally require a specific signer public key. */
export function verifyEnvelope(env, expectedPublicKey) {
  try {
    if (!env || !env.signature || !env.publicKey) return { ok: false, reason: "unsigned" };
    if (expectedPublicKey && env.publicKey !== expectedPublicKey) return { ok: false, reason: "signed by an unexpected key" };
    const key = createPublicKey({ key: Buffer.from(env.publicKey, "base64"), format: "der", type: "spki" });
    const ok = verify(null, Buffer.from(canonical(env.payload)), key, Buffer.from(env.signature, "base64"));
    if (!ok) return { ok: false, reason: "signature does not match content" };
    if (env.payload.expires && new Date(env.payload.expires) < new Date()) return { ok: false, reason: "expired" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "malformed: " + e.message };
  }
}
