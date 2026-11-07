import Link from "next/link";

const modules = [
  "AI Sales Assistant",
  "Product Catalog",
  "Customer Management",
  "Order Management",
  "M-Pesa Integration",
  "Negotiation Engine",
  "Analytics Dashboard",
  "Human Takeover",
];

const agents = [
  "Sales",
  "Negotiation",
  "Support",
  "Payment",
  "Follow-up",
  "Store Manager",
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#12261c]">
      <header className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="font-semibold tracking-tight">Whats AI</div>
        <nav className="flex gap-3 text-sm">
          <Link href="/simulate" className="px-3 py-2 rounded-lg hover:bg-white/70">
            Try simulator
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-[#0f3d2e] text-white"
          >
            Merchant dashboard
          </Link>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-20">
        <section className="pt-10 pb-16 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.2em] text-[#1f8a5b] mb-4">
            WhatsApp sales employee
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
            The AI that sells, bargains, collects M-Pesa, and tracks the order.
          </h1>
          <p className="mt-5 text-lg text-[#3d5248] max-w-2xl">
            Whats AI is not a delivery company. It runs customer conversations
            on WhatsApp from first hello to a fulfilled order. The shop or a
            courier handles the physical delivery.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/simulate"
              className="px-5 py-3 rounded-full bg-[#1f8a5b] text-white text-sm font-medium"
            >
              Chat with the demo shop
            </Link>
            <Link
              href="/dashboard"
              className="px-5 py-3 rounded-full border border-[#0f3d2e]/20 text-sm font-medium"
            >
              Open dashboard
            </Link>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-black/5">
            <h2 className="font-medium mb-2">What it does</h2>
            <p className="text-sm text-[#3d5248] leading-6">
              Answers customers, recommends products, negotiates up to 5
              rounds, creates orders, processes M-Pesa, and sends status
              updates — 24/7.
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-black/5">
            <h2 className="font-medium mb-2">What it does not do</h2>
            <p className="text-sm text-[#3d5248] leading-6">
              It does not own riders, warehouses, or fleets. Logistics stay
              with the business or their courier partner.
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-black/5">
            <h2 className="font-medium mb-2">Negotiation</h2>
            <p className="text-sm text-[#3d5248] leading-6">
              Merchants set a floor price. The AI bargains toward it, then
              stops. Margins stay protected.
            </p>
          </div>
        </section>

        <section className="mt-12 grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide mb-3">
              Core modules
            </h2>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              {modules.map((item) => (
                <li
                  key={item}
                  className="bg-white/80 border border-black/5 rounded-xl px-3 py-2"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide mb-3">
              Agents
            </h2>
            <ul className="flex flex-wrap gap-2 text-sm">
              {agents.map((item) => (
                <li
                  key={item}
                  className="px-3 py-1.5 rounded-full bg-[#0f3d2e] text-white"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
