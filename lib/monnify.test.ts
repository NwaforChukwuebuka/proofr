import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@/lib/monnify";

describe("verifyWebhookSignature", () => {
  const secret = "test-monnify-secret";
  const body = '{"eventType":"SUCCESSFUL_TRANSACTION","amount":1000}';

  afterEach(() => {
    delete process.env.MONNIFY_SECRET_KEY;
  });

  it("returns false when secret or header is missing", () => {
    expect(verifyWebhookSignature(body, "abc")).toBe(false);

    process.env.MONNIFY_SECRET_KEY = secret;
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });

  it("accepts a valid HMAC-SHA512 hex signature", () => {
    process.env.MONNIFY_SECRET_KEY = secret;
    const signature = crypto.createHmac("sha512", secret).update(body, "utf8").digest("hex");

    expect(verifyWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects a tampered body or wrong signature", () => {
    process.env.MONNIFY_SECRET_KEY = secret;
    const signature = crypto.createHmac("sha512", secret).update(body, "utf8").digest("hex");

    expect(verifyWebhookSignature(body + "x", signature)).toBe(false);
    expect(verifyWebhookSignature(body, "00".repeat(64))).toBe(false);
  });
});
