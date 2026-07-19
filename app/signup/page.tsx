"use client";

import { useState } from "react";
import Link from "next/link";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

type Step = "account" | "verification" | "business" | "review" | "pending";

interface FormState {
  phone: string;
  email: string;
  password: string;
  businessName: string;
  bvnOrNin: string;
}

interface SignupResult {
  merchantId: string;
  approvalStatus: string;
}

const initialForm: FormState = {
  phone: "",
  email: "",
  password: "",
  businessName: "",
  bvnOrNin: "",
};

export default function SignupPage() {
  const [step, setStep] = useState<Step>("account");
  const [form, setForm] = useState<FormState>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SignupResult | null>(null);
  const [kycVerified, setKycVerified] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateAccount(): boolean {
    const errors: Record<string, string> = {};
    if (!form.phone.trim()) {
      errors.phone = "Phone number is required.";
    } else if (!E164_PATTERN.test(form.phone.trim())) {
      errors.phone =
        "Phone must be in international format, e.g. +2348012345678.";
    }
    if (!form.email.trim()) {
      errors.email = "Email is required.";
    }
    if (!form.password) {
      errors.password = "Password is required.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateBusiness(): boolean {
    const errors: Record<string, string> = {};
    if (!form.businessName.trim()) {
      errors.businessName = "Business name is required.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.phone.trim(),
          email: form.email.trim(),
          password: form.password,
          businessName: form.businessName.trim(),
          ...(form.bvnOrNin.trim() ? { bvnOrNin: form.bvnOrNin.trim() } : {}),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          data?.error ??
          (res.status >= 500
            ? "Something went wrong on our end while creating your account. Please try again."
            : "Signup failed. Please check your details and try again.");
        setSubmitError(message);
        setSubmitting(false);
        return;
      }

      setResult(data as SignupResult);
      setKycVerified(Boolean(form.bvnOrNin.trim()));
      setStep("pending");
    } catch {
      setSubmitError(
        "Couldn't reach the server. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          &larr; PROOFR
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Merchant signup
        </h1>

        {step !== "pending" && <StepIndicator step={step} />}

        {step === "account" && (
          <div className="mt-6 space-y-4">
            <Field
              label="Phone number"
              hint="International format, e.g. +2348012345678"
              value={form.phone}
              onChange={(v) => update("phone", v)}
              error={fieldErrors.phone}
              type="tel"
              placeholder="+2348012345678"
            />
            <Field
              label="Email"
              value={form.email}
              onChange={(v) => update("email", v)}
              error={fieldErrors.email}
              type="email"
              placeholder="you@business.com"
            />
            <Field
              label="Password"
              value={form.password}
              onChange={(v) => update("password", v)}
              error={fieldErrors.password}
              type="password"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => {
                if (validateAccount()) setStep("verification");
              }}
              className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Continue
            </button>
          </div>
        )}

        {step === "verification" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Verify your identity with your BVN or NIN to speed up approval.
              This step is optional — you can add it later.
            </p>
            <Field
              label="BVN or NIN"
              hint="10–11 digit number"
              value={form.bvnOrNin}
              onChange={(v) => update("bvnOrNin", v)}
              type="text"
              placeholder="Optional"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("account")}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("business")}
                className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "business" && (
          <div className="mt-6 space-y-4">
            <Field
              label="Business name"
              value={form.businessName}
              onChange={(v) => update("businessName", v)}
              error={fieldErrors.businessName}
              type="text"
              placeholder="e.g. Test Suya Spot"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("verification")}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (validateBusiness()) setStep("review");
                }}
                className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="mt-6 space-y-4">
            <dl className="space-y-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <ReviewRow label="Phone" value={form.phone} />
              <ReviewRow label="Email" value={form.email} />
              <ReviewRow label="Business name" value={form.businessName} />
              <ReviewRow
                label="BVN/NIN"
                value={form.bvnOrNin.trim() || "Not provided"}
              />
            </dl>

            {submitError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                {submitError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("business")}
                disabled={submitting}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {submitting ? "Submitting…" : "Submit application"}
              </button>
            </div>
          </div>
        )}

        {step === "pending" && result && (
          <div className="mt-6 space-y-4 rounded-lg border border-zinc-200 p-6 text-center dark:border-zinc-800">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              &#9203;
            </div>
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Application pending approval
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Thanks, {form.businessName}. Your account has been created and
              your application is now with our team for review. We&apos;ll be
              in touch once it&apos;s approved.
            </p>
            {kycVerified && (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                Identity verified
              </p>
            )}
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              Reference: {result.merchantId}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "account", label: "Account" },
    { key: "verification", label: "Verify" },
    { key: "business", label: "Business" },
    { key: "review", label: "Review" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="mt-4 flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center gap-2">
          <div
            className={`h-1.5 flex-1 rounded-full ${
              i <= currentIndex
                ? "bg-black dark:bg-white"
                : "bg-zinc-200 dark:bg-zinc-800"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  hint,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-white ${
          error
            ? "border-red-400"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      />
      {hint && !error && (
        <span className="mt-1 block text-xs text-zinc-400 dark:text-zinc-600">
          {hint}
        </span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="truncate text-right font-medium text-black dark:text-zinc-50">
        {value}
      </dd>
    </div>
  );
}
