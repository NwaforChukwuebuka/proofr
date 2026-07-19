"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getBrowserSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);

    const supabase = getBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
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
            Merchant login
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in with the email and password from your signup.
          </p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-zinc-700">Email</span>
              <input
                type="email"
                value={email}
                placeholder="you@business.com"
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 border-brand-tint bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-zinc-700">Password</span>
              <input
                type="password"
                value={password}
                placeholder="Your password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email && password && !submitting) submit();
                }}
                className="mt-1 w-full rounded-xl border-2 border-brand-tint bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand"
              />
            </label>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitting || !email || !password}
              className="w-full rounded-full bg-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-center text-sm text-zinc-500">
              No account yet?{" "}
              <Link href="/signup" className="font-semibold text-brand">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
