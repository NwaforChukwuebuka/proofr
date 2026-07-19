import { createHash } from "crypto";

export interface KycVerificationResult {
  verified: boolean;
  reference: string;
}

/**
 * MOCK ONLY — no real BVN/NIN verification sandbox was reachable with the
 * env vars in .env.local.example (no Monnify KYC credentials configured).
 * Deterministic given the same input, so demo runs are reproducible.
 * Swap the body of this function for a real provider call later; callers
 * only depend on the KycVerificationResult shape.
 */
export function mockVerifyBvnNin(bvnOrNin: string): KycVerificationResult {
  const normalized = bvnOrNin.trim();
  const verified = /^\d{10,11}$/.test(normalized);
  const reference = `MOCK-KYC-${createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16)}`;

  return { verified, reference };
}
