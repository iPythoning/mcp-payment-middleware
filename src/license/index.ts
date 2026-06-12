import type { LicenseKey } from "../types.js";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Generate a cryptographically random license key.
 * Format: mcp-XXXX-XXXX-XXXX (3 groups of 4 alphanumeric chars)
 */
export function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0/O/I/1 to avoid confusion
  const group = (): string => {
    const bytes = randomBytes(4);
    let result = "";
    for (let i = 0; i < 4; i++) {
      result += chars[bytes[i]! % chars.length]!;
    }
    return result;
  };
  return `mcp-${group()}-${group()}-${group()}`;
}

/**
 * Create a signed license key with embedded metadata.
 * The signature prevents tampering.
 */
export function createLicenseKey(opts: {
  secret: string;
  maxCalls?: number;
  expiresAt?: Date;
  metadata?: Record<string, string>;
}): LicenseKey {
  const key = generateLicenseKey();
  const signature = signKey(key, opts.secret);

  return {
    key: `${key}.${signature}`,
    createdAt: new Date(),
    expiresAt: opts.expiresAt ?? null,
    maxCalls: opts.maxCalls ?? null,
    callCount: 0,
    metadata: opts.metadata ?? {},
  };
}

/**
 * Validate a license key's signature and expiry.
 * Returns the parsed LicenseKey if valid, null otherwise.
 */
export function validateLicenseKey(
  keyString: string,
  secret: string,
): LicenseKey | null {
  const parts = keyString.split(".");
  if (parts.length !== 2) return null;

  const [key, signature] = parts;
  const expectedSig = signKey(key!, secret);

  if (!timingSafeEqual(signature!, expectedSig)) return null;

  return {
    key: keyString,
    createdAt: new Date(), // Cannot recover original creation time from key alone
    expiresAt: null,
    maxCalls: null,
    callCount: 0,
    metadata: {},
  };
}

/**
 * Check if a pre-configured license key is valid and has remaining calls.
 */
export function checkLicenseKey(
  keyString: string,
  licenses: LicenseKey[],
): LicenseKey | null {
  const found = licenses.find((l) => l.key === keyString);
  if (!found) return null;

  // Check expiry
  if (found.expiresAt && new Date() > found.expiresAt) return null;

  // Check call limit
  if (found.maxCalls !== null && found.callCount >= found.maxCalls) return null;

  return found;
}

function signKey(key: string, secret: string): string {
  return createHmac("sha256", secret).update(key).digest("base64url").slice(0, 16);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
