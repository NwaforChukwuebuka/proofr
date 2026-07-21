import Link from "next/link";
import { ProofPipeline } from "./home/proof-pipeline";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <Header />
      <Hero />
      <TransformationStrip />
      <HowItWorks />
      <ForLenders />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-extrabold text-white">
            P
          </span>
          <span className="font-display text-base font-extrabold tracking-tight text-zinc-900">
            PROOFR
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-semibold text-zinc-600 sm:flex">
          <a
            href="#how-it-works"
            className="cursor-pointer transition hover:text-zinc-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            How it works
          </a>
          <a
            href="#lenders"
            className="cursor-pointer transition hover:text-zinc-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            For lenders
          </a>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="cursor-pointer rounded-full px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-4"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="cursor-pointer rounded-full bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-5"
          >
            Verify my revenue
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="hero-atmosphere pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(0,82,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,82,255,0.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-12 sm:px-8 sm:pb-16 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pb-20 lg:pt-20">
        <div className="max-w-xl">
          <p className="hero-copy-in font-display text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">
            PROOFR
          </p>
          <h1 className="hero-copy-in-delay font-display mt-4 text-[2.1rem] font-extrabold leading-[1.08] tracking-tight text-zinc-950 sm:text-4xl lg:text-[2.75rem]">
            Your business already has proof of revenue.
            <span className="mt-2 block text-brand">We make lenders trust it.</span>
          </h1>
          <p className="hero-copy-in-late mt-5 max-w-md text-pretty text-lg leading-relaxed text-zinc-600">
            Collect payments normally. Build a verified revenue profile. Access
            financing faster — without spreadsheet archaeology.
          </p>

          <div className="hero-copy-in-late mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="cursor-pointer rounded-full bg-brand px-8 py-3.5 text-center text-sm font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Verify my revenue
            </Link>
            <Link
              href="/login"
              className="cursor-pointer rounded-full px-5 py-3 text-center text-sm font-semibold text-zinc-700 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Lender? Access portal →
            </Link>
          </div>

          <p className="hero-copy-in-late mt-8 text-xs font-medium tracking-wide text-zinc-500">
            Built for Nigerian merchants &amp; the lenders who fund them
          </p>
        </div>

        <div className="hero-copy-in-late lg:pl-2">
          <ProofPipeline />
        </div>
      </div>
    </section>
  );
}

function TransformationStrip() {
  const stages = [
    { from: "Bank transfer", to: "Messy inflow" },
    { from: "PROOFR", to: "Fraud-screened" },
    { from: "Verified revenue", to: "Clean history" },
    { from: "Credit profile", to: "Score + offer" },
    { from: "Shared", to: "Loan-ready" },
  ];

  return (
    <section className="border-y border-zinc-200 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
        <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
          The transformation
        </p>
        <h2 className="font-display mx-auto mt-3 max-w-2xl text-center text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Every payment becomes lender-ready evidence
        </h2>

        <div className="mt-8 flex flex-wrap items-stretch justify-center gap-2 sm:gap-0">
          {stages.map((s, i) => (
            <div key={s.from} className="flex items-center">
              <div className="min-w-[7.5rem] rounded-xl bg-white/5 px-3 py-3 text-center ring-1 ring-white/10 sm:min-w-[8.5rem]">
                <p className="font-display text-sm font-bold text-white">{s.from}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">{s.to}</p>
              </div>
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className="mx-1 hidden font-mono text-brand sm:inline sm:mx-2"
                >
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Get a dedicated account",
      body: "Customers pay you the way they already do — transfers land in your PROOFR account.",
      visual: "Account issued",
    },
    {
      title: "Collect as usual",
      body: "No new checkout. No new payment flow. Just business as usual, with a cleaner trail.",
      visual: "Inflows arrive",
    },
    {
      title: "Watch verification run",
      body: "Risky patterns get flagged. Clean revenue is classified into a trusted history.",
      visual: "Score updates",
    },
    {
      title: "Share for credit",
      body: "Send a Proof-of-Revenue profile. Lenders see confidence, not raw bank noise.",
      visual: "Offer unlocked",
    },
  ];

  return (
    <section id="how-it-works" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
            From transfer to trusted credit profile
          </h2>
          <p className="mt-3 text-zinc-600">
            One continuous pipeline — not another payment gateway.
          </p>
        </div>

        <ol className="mt-10 space-y-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="grid gap-4 rounded-2xl border border-zinc-200 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_55%)] p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-6 sm:p-5"
            >
              <span className="font-mono text-sm font-bold text-brand">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-xl font-bold text-zinc-900">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-zinc-600">{step.body}</p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand">
                {step.visual}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ForLenders() {
  return (
    <section id="lenders" className="border-y border-zinc-200 bg-zinc-50 py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
            For lenders
          </span>
          <h2 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
            Underwrite the revenue story — not the noise
          </h2>
          <p className="mt-4 text-zinc-600">
            See verified inflows, confidence scores, and recommended loan
            amounts before you approve. PROOFR is credit infrastructure, not
            another wallet.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="cursor-pointer inline-block rounded-full bg-zinc-900 px-7 py-3 text-sm font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Access the lender portal
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
            Merchant profile
          </p>
          <p className="mt-2 font-display text-xl font-bold text-zinc-900">
            Awal &amp; Sons Construction
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Verified revenue
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-zinc-950">₦100.05M</p>
            </div>
            <div className="rounded-xl bg-brand-tint/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Confidence
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-brand">96</p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Eligible loan
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-zinc-950">₦3.4M</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Fraud flags
              </p>
              <p className="mt-1 text-lg font-bold text-emerald-700">0 open</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-zinc-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(0,82,255,0.4),transparent_45%),radial-gradient(circle_at_90%_10%,rgba(0,82,255,0.25),transparent_40%)]"
      />
      <div className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:px-8 sm:py-20">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Stop proving your revenue manually
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-balance text-zinc-300">
          Create a business profile, collect as usual, and turn every transfer
          into evidence lenders can act on.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="cursor-pointer w-full rounded-full bg-white px-8 py-3.5 text-sm font-bold text-brand shadow-lg transition duration-200 hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
          >
            Create my business profile
          </Link>
          <Link
            href="/login"
            className="cursor-pointer w-full rounded-full border border-zinc-500 px-8 py-3.5 text-sm font-bold text-white transition duration-200 hover:border-white hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
          >
            Log in
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-100 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-8 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">
            P
          </span>
          <span className="font-display text-sm font-bold text-zinc-900">PROOFR</span>
        </div>
        <p className="text-xs text-zinc-400">
          &copy; {new Date().getFullYear()} PROOFR. Messy bank transfers →
          lender-ready revenue.
        </p>
      </div>
    </footer>
  );
}
