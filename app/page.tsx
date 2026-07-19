import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-brand px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg">
        <span className="text-2xl font-extrabold text-brand">P</span>
      </div>

      <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white">
        PROOFR
      </h1>
      <p className="mt-3 max-w-sm text-balance text-blue-100">
        Turn your business payments into a trusted revenue history — get a
        dedicated account, verified revenue, and access to credit.
      </p>

      <Link
        href="/signup"
        className="mt-8 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-brand shadow-lg transition hover:bg-blue-50 active:scale-95"
      >
        Get started as a merchant
      </Link>

      <Link
        href="/login"
        className="mt-3 text-sm font-semibold text-blue-100 hover:text-white"
      >
        Already have an account? Log in
      </Link>

      <div className="mt-12 w-full max-w-xs rounded-3xl bg-white p-5 text-left shadow-2xl">
        <p className="text-xs font-medium text-zinc-400">Verified revenue</p>
        <p className="mt-1 text-2xl font-extrabold text-zinc-900">
          &#8358;0.00
        </p>
        <div className="mt-4 flex gap-2">
          <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">
            Dedicated account
          </span>
          <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">
            Fraud checks
          </span>
        </div>
      </div>
    </div>
  );
}
