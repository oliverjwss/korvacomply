import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { requireEnv } from "@/lib/env";

export type OAuthStatePayload = {
  subdomain: string;
  nonce: string;
};

function getSecret(): string {
  return requireEnv("OAUTH_STATE_SECRET");
}

export function encodeOAuthState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function decodeOAuthState(state: string): OAuthStatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid state");
  }
  const [body, sig] = parts;
  const expected = createHmac("sha256", getSecret()).update(body).digest();
  const actual = Buffer.from(sig, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid state signature");
  }
  const json = Buffer.from(body, "base64url").toString("utf8");
  const parsed = JSON.parse(json) as OAuthStatePayload;
  if (!parsed.subdomain || !parsed.nonce) {
    throw new Error("Invalid state payload");
  }
  return parsed;
}

export function randomNonce(): string {
  return randomBytes(16).toString("hex");
}
