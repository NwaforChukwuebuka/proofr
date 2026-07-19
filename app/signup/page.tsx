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
    <div className="flex flex-1 flex-col items-center bg-brand px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-100 hover:text-white"
        >
          &larr; PROOFR
        </Link>

        <div className="mt-4 rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
            {step === "pending" ? "You're all set" : "Merchant signup"}
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
              <PrimaryButton
                onClick={() => {
                  if (validateAccount()) setStep("verification");
                }}
              >
                Continue
              </PrimaryButton>
            </div>
          )}

          {step === "verification" && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-zinc-500">
                Verify your identity with your BVN or NIN to speed up
                approval. This step is optional — you can add it later.
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
                <SecondaryButton onClick={() => setStep("account")}>
                  Back
                </SecondaryButton>
                <PrimaryButton onClick={() => setStep("business")}>
                  Continue
                </PrimaryButton>
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
                <SecondaryButton onClick={() => setStep("verification")}>
                  Back
                </SecondaryButton>
                <PrimaryButton
                  onClick={() => {
                    if (validateBusiness()) setStep("review");
                  }}
                >
                  Continue
                </PrimaryButton>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="mt-6 space-y-4">
              <dl className="space-y-2 rounded-2xl bg-brand-tint p-4 text-sm">
                <ReviewRow label="Phone" value={form.phone} />
                <ReviewRow label="Email" value={form.email} />
                <ReviewRow label="Business name" value={form.businessName} />
                <ReviewRow
                  label="BVN/NIN"
                  value={form.bvnOrNin.trim() || "Not provided"}
                />
              </dl>

              {submitError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </p>
              )}

              <div className="flex gap-3">
                <SecondaryButton
                  onClick={() => setStep("business")}
                  disabled={submitting}
                >
                  Back
                </SecondaryButton>
                <PrimaryButton onClick={submit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit application"}
                </PrimaryButton>
              </div>
            </div>
          )}

          {step === "pending" && result && (
            <div className="mt-6 space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-2xl text-brand">
                &#9203;
              </div>
              <h2 className="text-lg font-bold text-zinc-900">
                Application pending approval
              </h2>
              <p className="text-sm text-zinc-500">
                Thanks, {form.businessName}. Your account has been created
                and your application is now with our team for review.
                We&apos;ll be in touch once it&apos;s approved.
              </p>
              {kycVerified && (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                  Identity verified
                </p>
              )}
              <p className="text-xs text-zinc-400">
                Reference: {result.merchantId}
              </p>
              <Link
                href="/login"
                className="inline-block text-sm font-semibold text-brand"
              >
                Go to login &rarr;
              </Link>
            </div>
          )}
        </div>
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
              i <= currentIndex ? "bg-brand" : "bg-brand-tint"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full bg-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full border-2 border-brand-tint px-4 py-3 text-sm font-bold text-brand transition hover:bg-brand-tint disabled:opacity-50"
    >
      {children}
    </button>
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
      <span className="text-sm font-semibold text-zinc-700">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-xl border-2 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand ${
          error ? "border-red-400" : "border-brand-tint"
        }`}
      />
      {hint && !error && (
        <span className="mt-1 block text-xs text-zinc-400">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      )}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate text-right font-semibold text-zinc-900">
        {value}
      </dd>
    </div>
  );
}
