"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Business } from "@/lib/types";

export default function SettingsPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ business: Business }>("/api/dashboard/settings")
      .then((res) => setBusiness(res.business))
      .catch((err) => setError(err.message));
  }, []);

  async function save() {
    if (!business) return;
    setError("");
    setSaved(false);
    try {
      const res = await api<{ business: Business }>("/api/dashboard/settings", {
        method: "PATCH",
        body: JSON.stringify(business),
      });
      setBusiness(res.business);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (!business) return <p className="text-sm text-slate-500">{error || "Loading…"}</p>;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <div className="bg-white border border-black/5 rounded-xl p-4 space-y-3">
        <label className="block text-sm">
          Shop name
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={business.businessName}
            onChange={(e) =>
              setBusiness({ ...business, businessName: e.target.value })
            }
          />
        </label>
        <label className="block text-sm">
          M-Pesa till
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={business.mpesaTill}
            onChange={(e) =>
              setBusiness({ ...business, mpesaTill: e.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={business.aiEnabled}
            onChange={(e) =>
              setBusiness({ ...business, aiEnabled: e.target.checked })
            }
          />
          AI assistant enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={business.negotiationEnabled}
            onChange={(e) =>
              setBusiness({ ...business, negotiationEnabled: e.target.checked })
            }
          />
          Allow bargaining
        </label>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {saved && <p className="text-emerald-700 text-sm">Saved.</p>}
        <button
          onClick={save}
          className="px-4 py-2 bg-[#0f3d2e] text-white rounded-lg text-sm"
        >
          Save
        </button>
      </div>
    </div>
  );
}
