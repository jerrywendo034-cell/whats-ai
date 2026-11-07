"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { kes } from "@/lib/format";
import type { Order, OrderStatus, Product, Customer } from "@/lib/types";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "PACKED",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

type OrderRow = Order & { customer?: Customer; product?: Product };

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const res = await api<{ orders: OrderRow[] }>("/api/dashboard/orders");
    setOrders(res.orders || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function updateStatus(id: string, status: OrderStatus) {
    await api(`/api/dashboard/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Orders</h1>
        <p className="text-sm text-slate-500">
          Update packing and courier status here. Whats AI tells the customer.
        </p>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="bg-white border border-black/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-slate-50">
                <td className="px-4 py-3">
                  {order.customer?.name || order.customer?.phone}
                </td>
                <td className="px-4 py-3">{order.product?.name}</td>
                <td className="px-4 py-3">{kes(order.total)}</td>
                <td className="px-4 py-3">
                  <select
                    value={order.status}
                    onChange={(e) =>
                      updateStatus(order.id, e.target.value as OrderStatus)
                    }
                    className="border rounded-lg px-2 py-1"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={4}>
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
