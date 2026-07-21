import { describe, expect, it } from "vitest";
import { mockVerifyBvnNin } from "@/lib/kyc";

describe("mockVerifyBvnNin", () => {
  it("verifies 10-digit and 11-digit numeric IDs", () => {
    expect(mockVerifyBvnNin("1234567890").verified).toBe(true);
    expect(mockVerifyBvnNin("12345678901").verified).toBe(true);
  });

  it("rejects non-numeric or wrong-length input", () => {
    expect(mockVerifyBvnNin("123").verified).toBe(false);
    expect(mockVerifyBvnNin("abcdefghij").verified).toBe(false);
    expect(mockVerifyBvnNin("123456789012").verified).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(mockVerifyBvnNin("  1234567890  ").verified).toBe(true);
  });

  it("returns a deterministic MOCK-KYC reference for the same input", () => {
    const a = mockVerifyBvnNin("12345678901");
    const b = mockVerifyBvnNin("12345678901");

    expect(a.reference).toMatch(/^MOCK-KYC-[a-f0-9]{16}$/);
    expect(a.reference).toBe(b.reference);
  });

  it("produces different references for different inputs", () => {
    const a = mockVerifyBvnNin("1234567890");
    const b = mockVerifyBvnNin("0987654321");
    expect(a.reference).not.toBe(b.reference);
  });
});
