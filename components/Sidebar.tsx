"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/simulate", label: "WhatsApp simulator" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-black/10 bg-white flex flex-col min-h-screen sticky top-0">
      <Link href="/" className="px-4 py-5 border-b border-black/10 font-semibold text-sm">
        Whats AI
      </Link>
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2 rounded-lg text-sm ${
                active
                  ? "bg-emerald-50 text-emerald-800 font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
