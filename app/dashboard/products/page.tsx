"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { kes } from "@/lib/format";
import type { Product } from "@/lib/types";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    name: "",
    price: "",
    minimumPrice: "",
    stock: "",
    category: "",
    negotiationEnabled: true,
  });
  const [error, setError] = useState("");

  async function load() {
    const res = await api<{ products: Product[] }>("/api/dashboard/products");
    setProducts(res.products || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function create() {
    setError("");
    try {
      await api("/api/dashboard/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          price: Number(form.price),
          minimumPrice: Number(form.minimumPrice || form.price),
          stock: Number(form.stock || 0),
          category: form.category,
          negotiationEnabled: form.negotiationEnabled,
        }),
      });
      setForm({
        name: "",
        price: "",
        minimumPrice: "",
        stock: "",
        category: "",
        negotiationEnabled: true,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add product");
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-lg font-semibold">Products</h1>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="bg-white border border-black/5 rounded-xl p-4 grid md:grid-cols-6 gap-2">
        <input
          className="border rounded-lg px-3 py-2 text-sm"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="border rounded-lg px-3 py-2 text-sm"
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <input
          className="border rounded-lg px-3 py-2 text-sm"
          placeholder="Min price"
          value={form.minimumPrice}
          onChange={(e) => setForm({ ...form, minimumPrice: e.target.value })}
        />
        <input
          className="border rounded-lg px-3 py-2 text-sm"
          placeholder="Stock"
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: e.target.value })}
        />
        <input
          className="border rounded-lg px-3 py-2 text-sm"
          placeholder="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <button onClick={create} className="bg-[#0f3d2e] text-white rounded-lg text-sm">
          Add
        </button>
      </div>
      <label className="text-sm flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.negotiationEnabled}
          onChange={(e) => setForm({ ...form, negotiationEnabled: e.target.checked })}
        />
        Allow bargaining (max 5 rounds, never below min price)
      </label>
      <div className="grid md:grid-cols-2 gap-3">
        {products.map((p) => (
          <div key={p.id} className="bg-white border border-black/5 rounded-xl p-4">
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-slate-500">
              {kes(p.price)} · floor {kes(p.minimumPrice)} · stock {p.stock}
            </div>
            <div className="text-xs mt-2 text-emerald-700">
              {p.negotiationEnabled ? "Bargaining on" : "Fixed price"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
