"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { kes } from "@/lib/format";

type DashboardData = {
  business: { businessName: string };
  summary: {
    todayOrders: number;
    todayRevenue: number;
    activeChats: number;
    paidRevenue: number;
  };
  orders: { id: string; total: number; status: string; customerId: string }[];
  conversations: { id: string; lastMessage: string; customer?: { phone: string } }[];
  products: { id: string; name: string; stock: number }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const cards = [
    { label: "Today revenue", value: data ? kes(data.summary.todayRevenue) : "—" },
    { label: "Today orders", value: data?.summary.todayOrders ?? "—" },
    { label: "Active chats", value: data?.summary.activeChats ?? "—" },
    { label: "Paid revenue", value: data ? kes(data.summary.paidRevenue) : "—" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Overview</h1>
          <p className="text-sm text-slate-500">
            {data?.business.businessName || "Demo shop"} · sales and tracking, not logistics
          </p>
        </div>
        <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-medium">
          Step 1 live
        </span>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border border-black/5 rounded-xl p-4">
            <div className="text-xs text-slate-500">{card.label}</div>
            <div className="text-xl font-semibold mt-1">{card.value}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white border border-black/5 rounded-xl p-4">
          <h2 className="text-sm font-medium mb-3">Recent orders</h2>
          <div className="space-y-2 text-sm">
            {data?.orders.length === 0 && (
              <p className="text-slate-400">No orders yet. Use the simulator to create one.</p>
            )}
            {data?.orders.map((order) => (
              <div key={order.id} className="flex justify-between border-b border-slate-50 pb-2">
                <span>{order.id.slice(0, 8)}</span>
                <span>
                  {kes(order.total)} · {order.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white border border-black/5 rounded-xl p-4">
            <h2 className="text-sm font-medium mb-3">Chats</h2>
            {data?.conversations.slice(0, 5).map((chat) => (
              <p key={chat.id} className="text-sm text-slate-600 truncate">
                {chat.customer?.phone}: {chat.lastMessage}
              </p>
            ))}
            {!data?.conversations.length && (
              <p className="text-sm text-slate-400">No chats yet.</p>
            )}
          </div>
          <div className="bg-white border border-black/5 rounded-xl p-4">
            <h2 className="text-sm font-medium mb-3">Low stock</h2>
            {data?.products.filter((p) => p.stock <= 8).map((p) => (
              <p key={p.id} className="text-sm">
                {p.name} — {p.stock}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
