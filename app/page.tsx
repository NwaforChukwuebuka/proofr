import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <Header />
      <Hero />
      <ProblemToProof />
      <HowItWorks />
      <ForLenders />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
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
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_25%_0%,rgba(0,82,255,0.16),transparent_65%),radial-gradient(circle_at_80%_10%,rgba(0,56,184,0.14),transparent_58%)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 sm:px-8 sm:pb-14 sm:pt-18 lg:pb-16 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="hero-copy-in font-display text-xs font-bold uppercase tracking-[0.24em] text-brand">
            PROOFR
          </p>
          <h1 className="hero-copy-in-delay font-display mt-4 text-4xl font-extrabold leading-[1.04] tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl">
            Turn business payments into revenue lenders can trust
          </h1>
          <p className="hero-copy-in-late mx-auto mt-5 max-w-2xl text-pretty text-lg text-zinc-600">
            Get a dedicated business account, collect customer payments as
            usual, and build a verified revenue history you can share for
            faster credit decisions.
          </p>

          <div className="hero-copy-in-late mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="cursor-pointer rounded-full bg-brand px-8 py-3.5 text-sm font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Get started
            </Link>
            <p className="text-sm text-zinc-500">
              Lender?{" "}
              <Link
                href="/login"
                className="cursor-pointer font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Access lender portal
              </Link>
            </p>
          </div>
        </div>
      </div>

      <LedgerStrip />
    </section>
  );
}

function LedgerStrip() {
  const rows = [
    { payer: "Yolanda Stores", amount: "+₦11,560.00", time: "10:42", positive: true },
    { payer: "0901 234 567 · Transfer", amount: "-₦10,550.00", time: "10:31" },
    { payer: "Mich Boutique", amount: "+₦10,550.00", time: "09:58", positive: true },
  ];

  return (
    <div className="border-y border-zinc-200 bg-[linear-gradient(110deg,#f8fbff_0%,#edf4ff_48%,#f9fbff_100%)]">
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 sm:py-7">
        <div className="grid gap-5 lg:grid-cols-[1.3fr_2fr] lg:items-start">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Verified revenue
              </p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-tight text-zinc-950">
                ₦10,050,000
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Dedicated account inflows after fraud-screening and cleaning.
              </p>
            </div>
            <div className="border-l-2 border-brand pl-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Revenue confidence
              </p>
              <p className="font-mono text-2xl font-bold text-brand">96%</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="grid grid-cols-[1.7fr_1fr_auto] gap-3 border-b border-zinc-200 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
              <span>Transaction</span>
              <span>Amount</span>
              <span>Time</span>
            </div>
            {rows.map((row, index) => (
              <div
                key={`${row.payer}-${row.time}`}
                className={`ledger-row-in grid grid-cols-[1.7fr_1fr_auto] gap-3 px-4 py-3 ${
                  index === rows.length - 1 ? "" : "border-b border-zinc-100"
                } ${
                  index === 1
                    ? "ledger-row-delay-1"
                    : index === 2
                      ? "ledger-row-delay-2"
                      : ""
                }`}
              >
                <p className="truncate text-sm font-medium text-zinc-700">{row.payer}</p>
                <p
                  className={`font-mono text-sm font-semibold ${
                    row.positive ? "text-emerald-700" : "text-zinc-700"
                  }`}
                >
                  {row.amount}
                </p>
                <p className="text-xs text-zinc-500">{row.time}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProblemToProof() {
  return (
    <section className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="border-l-2 border-zinc-200 pl-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
              The old way
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Bank transfer history alone is not reliable proof.
            </h2>
            <p className="mt-3 text-zinc-600">
              Lenders still spend time validating if inflows are real customer
              revenue or circular transfers.
            </p>
          </div>

          <div className="border-l-2 border-brand pl-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
              With PROOFR
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Revenue is verified, scored, and ready to share.
            </h2>
            <p className="mt-3 text-zinc-600">
              Every payment passes fraud checks, is grouped into clean revenue,
              and forms a lender-ready profile in one flow.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Get account",
      body: "Receive a dedicated account for your business in minutes.",
    },
    {
      title: "Collect",
      body: "Take customer payments exactly the way you already do.",
    },
    {
      title: "Verify",
      body: "PROOFR flags risky patterns and cleans inflows into verified revenue.",
    },
    {
      title: "Share",
      body: "Send your Proof-of-Revenue profile to lenders and access credit faster.",
    },
  ];

  return (
    <section id="how-it-works" className="bg-zinc-50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
            Process
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
            How PROOFR works
          </h2>
          <p className="mt-3 text-zinc-600">
            One sequence from payment collection to credit-ready proof.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {steps.map((step, index) => (
            <div key={step.title} className="relative border-l-2 border-zinc-200 pl-4">
              <span className="font-mono text-xs font-semibold text-brand">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-display text-2xl font-bold text-zinc-900">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-600">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForLenders() {
  return (
    <section id="lenders" className="border-y border-zinc-200 bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-start gap-8 px-5 sm:px-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
            For lenders
          </span>
          <h2 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
            Underwrite with real, verified revenue data
          </h2>
          <p className="mt-4 text-zinc-600">
            Stop guessing which transfers are genuine business income. Search
            merchant profiles, review revenue confidence and trends, and approve
            loans with clearer risk signals.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="cursor-pointer inline-block rounded-full border border-zinc-300 px-7 py-3 text-sm font-bold text-zinc-800 transition duration-200 hover:border-zinc-900 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Access the lender portal
            </Link>
          </div>
        </div>

        <div className="border-l-2 border-brand pl-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Example profile
          </p>
          <p className="mt-2 text-lg font-bold text-zinc-900">
            Awal &amp; Sons Construction
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <dt className="text-zinc-500">Verified revenue</dt>
              <dd className="font-mono font-semibold text-zinc-900">₦100.05M</dd>
            </div>
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <dt className="text-zinc-500">Confidence score</dt>
              <dd className="font-mono font-semibold text-brand">96%</dd>
            </div>
            <div className="flex items-center justify-between pb-1">
              <dt className="text-zinc-500">Fraud flags</dt>
              <dd className="font-semibold text-zinc-900">0 active</dd>
            </div>
          </dl>
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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(0,82,255,0.35),transparent_45%),radial-gradient(circle_at_90%_0%,rgba(0,82,255,0.28),transparent_42%)]"
      />
      <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:px-8 sm:py-20">
        <h2 className="font-display relative text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Ready to turn your revenue into credit access?
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-balance text-zinc-300">
          Get onboarded in under 10 minutes and start collecting verified
          revenue today.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="cursor-pointer w-full rounded-full bg-white px-8 py-3.5 text-sm font-bold text-brand shadow-lg transition duration-200 hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
          >
            Get started
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
          &copy; {new Date().getFullYear()} PROOFR. Proof-of-Revenue platform
          for merchants and lenders.
        </p>
      </div>
    </footer>
  );
}
