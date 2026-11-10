"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { ChatMessage } from "@/lib/types";

export default function SimulatePage() {
  const [from, setFrom] = useState("254711111111");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ messages: ChatMessage[] }>(
      `/api/simulate?from=${encodeURIComponent(from)}`,
    )
      .then((res) => setMessages(res.messages || []))
      .catch(() => undefined);
  }, [from]);

  async function send() {
    if (!text.trim() || busy) return;

    setBusy(true);
    setError("");

    try {
      const res = await api<{ messages: ChatMessage[] }>("/api/simulate", {
        method: "POST",
        body: JSON.stringify({
          from,
          text,
          name: "Amina",
        }),
      });

      setMessages(res.messages || []);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1410] text-white flex flex-col">
      <header className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
        <div>
          <div className="text-sm font-medium">Kilimani Threads</div>
          <div className="text-xs text-emerald-300">
            Whats AI demo · not a courier
          </div>
        </div>

        <Link
          href="/dashboard"
          className="text-xs text-white/70 hover:text-white"
        >
          Dashboard
        </Link>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto p-4 space-y-3 overflow-auto">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <label className="block text-xs text-white/60 mb-2">
            Test customer phone
          </label>

          <input
            className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none border border-white/10 focus:border-emerald-400"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="254711111111"
          />

          <p className="mt-2 text-xs text-white/40">
            Change this number to test a fresh customer conversation.
          </p>
        </div>

        {messages.length === 0 && (
          <p className="text-sm text-white/50">
            Try: “Hi”, “Do you have a hoodie?”, “too expensive, 1800”,
            “I’ll take it”, “paid”, “where is my order?”
          </p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.sender === "CUSTOMER"
                ? "ml-auto bg-[#1f8a5b]"
                : "bg-[#1c2b24] text-white/90"
            }`}
          >
            {m.content}
          </div>
        ))}

        {error && <p className="text-red-300 text-sm">{error}</p>}
      </main>

      <form
        className="max-w-xl w-full mx-auto p-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="flex-1 rounded-full bg-white/10 px-4 py-3 text-sm outline-none"
          placeholder="Type a WhatsApp message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <button
          disabled={busy}
          className="px-5 rounded-full bg-[#1f8a5b] text-sm disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}