import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <Header />
      <Hero />
      <TrustBar />
      <HowItWorks />
      <Features />
      <ForLenders />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-sm font-extrabold text-white">
            P
          </span>
          <span className="text-base font-extrabold tracking-tight text-zinc-900">
            PROOFR
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-semibold text-zinc-600 sm:flex">
          <a href="#how-it-works" className="hover:text-zinc-900">
            How it works
          </a>
          <a href="#features" className="hover:text-zinc-900">
            Features
          </a>
          <a href="#lenders" className="hover:text-zinc-900">
            For lenders
          </a>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="rounded-full px-3 py-2 text-sm font-semibold text-zinc-700 hover:text-zinc-900 sm:px-4"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark active:scale-95 sm:px-5"
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
    <section className="relative overflow-hidden bg-brand">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-dark/40 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center lg:py-28">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
            Proof-of-Revenue for MSMEs
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Turn your business payments into a trusted revenue history
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-balance text-lg text-blue-100 lg:mx-0">
            Collect payments through a dedicated business account, get your
            revenue verified automatically, and unlock access to credit — no
            paperwork, no guesswork.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              href="/signup"
              className="w-full rounded-full bg-white px-8 py-3.5 text-center text-sm font-bold text-brand shadow-lg transition hover:bg-blue-50 active:scale-95 sm:w-auto"
            >
              Get started as a merchant
            </Link>
            <Link
              href="/login"
              className="w-full rounded-full border-2 border-white/30 px-8 py-3.5 text-center text-sm font-bold text-white transition hover:bg-white/10 sm:w-auto"
            >
              I'm a lender
            </Link>
          </div>

          <p className="mt-4 text-xs text-blue-200">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-white underline underline-offset-2">
              Log in
            </Link>
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div className="rounded-3xl bg-white p-5 text-left shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-400">
                Verified revenue
              </p>
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700">
                Live
              </span>
            </div>
            <p className="mt-1 text-3xl font-extrabold text-zinc-900">
              &#8358;10,050,000.00
            </p>

            <div className="mt-4 flex gap-2">
              <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">
                Dedicated account
              </span>
              <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">
                Fraud checks
              </span>
            </div>

            <div className="mt-5 space-y-2 border-t border-zinc-100 pt-4">
              <TxnRow label="from Yolanda Stores" amount="+₦11,560.00" positive />
              <TxnRow label="to 0901234567 &middot; Transfer" amount="-₦10,550.00" />
              <TxnRow label="from Mich Boutique" amount="+₦10,550.00" positive />
            </div>
          </div>

          <div className="absolute -right-6 -top-6 hidden rounded-2xl bg-white px-4 py-3 shadow-xl sm:block">
            <p className="text-[10px] font-semibold text-zinc-400">
              Revenue confidence
            </p>
            <p className="text-lg font-extrabold text-brand">96%</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TxnRow({
  label,
  amount,
  positive,
}: {
  label: string;
  amount: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span
        className="text-zinc-500"
        dangerouslySetInnerHTML={{ __html: label }}
      />
      <span
        className={`font-bold ${positive ? "text-green-600" : "text-zinc-700"}`}
      >
        {amount}
      </span>
    </div>
  );
}

function TrustBar() {
  const stats = [
    { value: "100+", label: "Merchants onboarded" },
    { value: "₦50M+", label: "Verified payment volume" },
    { value: "<2%", label: "Suspected fraud rate" },
    { value: "<30s", label: "Revenue reflected" },
  ];

  return (
    <section className="border-b border-zinc-100 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 sm:px-8 lg:grid-cols-4 lg:gap-8 lg:py-12">
        {stats.map((s) => (
          <div key={s.label} className="text-center lg:text-left">
            <p className="text-2xl font-extrabold text-zinc-900 sm:text-3xl">
              {s.value}
            </p>
            <p className="mt-1 text-xs font-medium text-zinc-500 sm:text-sm">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Get a dedicated account",
      body: "Sign up and receive a dedicated virtual account for your business in minutes.",
    },
    {
      n: "02",
      title: "Collect payments",
      body: "Share your account with customers and collect payments the way you already do.",
    },
    {
      n: "03",
      title: "Revenue gets verified",
      body: "Our engine cleans and verifies your inflows, flagging anything suspicious automatically.",
    },
    {
      n: "04",
      title: "Unlock access to credit",
      body: "Share your Proof-of-Revenue report with lenders and get matched with funding.",
    },
  ];

  return (
    <section id="how-it-works" className="bg-zinc-50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
            How PROOFR works
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-balance text-zinc-500">
            From your first payment to your first loan, every step is
            designed to build a financial identity lenders can trust.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-100"
            >
              <span className="text-sm font-extrabold text-brand">{s.n}</span>
              <h3 className="mt-3 text-base font-bold text-zinc-900">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-500">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: "🏦",
      title: "Dedicated virtual accounts",
      body: "A business account issued to you alone, so every inflow is unambiguously yours.",
    },
    {
      icon: "🛡️",
      title: "Automated fraud detection",
      body: "Circular transfers, self-funding, and velocity spikes are flagged before they hurt your score.",
    },
    {
      icon: "📊",
      title: "Revenue dashboard",
      body: "See gross inflow, verified revenue, and trends update live as customers pay you.",
    },
    {
      icon: "📄",
      title: "Proof-of-Revenue reports",
      body: "A shareable report with your revenue confidence score, trends, and verification status.",
    },
    {
      icon: "🤝",
      title: "Lender-ready profile",
      body: "Lenders search, view, and download your verified profile — no back-and-forth paperwork.",
    },
    {
      icon: "🔁",
      title: "Automated repayment",
      body: "Loan repayments are deducted directly from future verified revenue.",
    },
  ];

  return (
    <section id="features" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
            Everything you need to prove your revenue
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-balance text-zinc-500">
            Built for informal businesses that deserve the same access to
            credit as anyone else.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-zinc-100 p-6 transition hover:shadow-lg hover:shadow-brand-tint"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-2xl">
                {f.icon}
              </div>
              <h3 className="mt-4 text-base font-bold text-zinc-900">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-500">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForLenders() {
  return (
    <section id="lenders" className="bg-zinc-900 py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-blue-300">
            For lenders
          </span>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Underwrite with real, verified revenue data
          </h2>
          <p className="mt-4 text-balance text-zinc-300">
            Stop guessing which transfers are genuine business income. Search
            any merchant, view their revenue confidence score and trends, and
            approve loans backed by verified data — with repayment automated
            straight from future revenue.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="inline-block rounded-full bg-white px-8 py-3.5 text-sm font-bold text-zinc-900 shadow-lg transition hover:bg-zinc-100 active:scale-95"
            >
              Access the lender portal
            </Link>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-2xl">
          <p className="text-xs font-medium text-zinc-400">Merchant profile</p>
          <p className="mt-1 text-lg font-extrabold text-zinc-900">
            Awal &amp; Sons Construction
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-brand-tint p-4">
              <p className="text-[10px] font-semibold text-zinc-500">
                Verified revenue
              </p>
              <p className="mt-1 text-xl font-extrabold text-brand">
                &#8358;100.05M
              </p>
            </div>
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="text-[10px] font-semibold text-zinc-500">
                Confidence score
              </p>
              <p className="mt-1 text-xl font-extrabold text-green-700">96%</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
              KYC verified
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
              0 fraud flags
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-brand">
      <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:px-8 sm:py-20">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Ready to turn your revenue into credit access?
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-balance text-blue-100">
          Get onboarded in under 10 minutes and start collecting verified
          revenue today.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="w-full rounded-full bg-white px-8 py-3.5 text-sm font-bold text-brand shadow-lg transition hover:bg-blue-50 active:scale-95 sm:w-auto"
          >
            Get started as a merchant
          </Link>
          <Link
            href="/login"
            className="w-full rounded-full border-2 border-white/30 px-8 py-3.5 text-sm font-bold text-white transition hover:bg-white/10 sm:w-auto"
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
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-xs font-extrabold text-white">
            P
          </span>
          <span className="text-sm font-bold text-zinc-900">PROOFR</span>
        </div>
        <p className="text-xs text-zinc-400">
          &copy; {new Date().getFullYear()} PROOFR. Proof-of-Revenue platform
          for merchants and lenders.
        </p>
      </div>
    </footer>
  );
}
