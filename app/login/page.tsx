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
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !signInData.session) {
      setError(signInError?.message ?? "Sign-in failed.");
      setSubmitting(false);
      return;
    }

    const userId = signInData.session.user.id;

    const { data: merchantRow } = await supabase
      .from("merchants")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (merchantRow) {
      router.push("/dashboard");
      return;
    }

    const { data: lenderRow } = await supabase
      .from("lenders")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (lenderRow) {
      router.push("/lender");
      return;
    }

    setError("This account isn't set up as a merchant or lender yet.");
    setSubmitting(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span aria-hidden>&larr;</span>
          <span className="inline-flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">
              P
            </span>
            <span className="font-display tracking-tight text-zinc-900">
              PROOFR
            </span>
          </span>
        </Link>

        <section className="mt-4 border-l-2 border-brand bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-8">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-zinc-900">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Merchants and lenders sign in here with the same email/password.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!submitting && email && password) {
                void submit();
              }
            }}
          >
            <label className="block">
              <span className="text-sm font-semibold text-zinc-700">Email</span>
              <input
                type="email"
                value={email}
                placeholder="you@business.com"
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error)}
                className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-zinc-700">Password</span>
              <input
                type="password"
                value={password}
                placeholder="Your password"
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email && password && !submitting) submit();
                }}
                className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </label>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password}
              aria-busy={submitting}
              className="w-full rounded-full bg-brand px-4 py-3 text-sm font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-center text-sm text-zinc-500">
              No account yet?{" "}
              <Link
                href="/signup"
                className="cursor-pointer font-semibold text-brand underline decoration-brand/30 underline-offset-4 transition hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Sign up
              </Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
