import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        PROOFR
      </h1>
      <p className="mt-2 max-w-md text-zinc-600 dark:text-zinc-400">
        Turn your business payments into a trusted revenue history — get a
        dedicated account, verified revenue, and access to credit.
      </p>
      <Link
        href="/signup"
        className="mt-6 rounded-lg bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Get started as a merchant
      </Link>
    </div>
  );
}
