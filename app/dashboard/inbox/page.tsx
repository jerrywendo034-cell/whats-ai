"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ChatMessage, Conversation, Customer } from "@/lib/types";

type ConversationRow = Conversation & {
  customer?: Customer;
  lastMessage: string;
};

export default function InboxPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [takeover, setTakeover] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  async function loadList() {
    const res = await api<{ conversations: ConversationRow[] }>(
      "/api/dashboard/conversations",
    );
    setConversations(res.conversations || []);
  }

  async function openChat(id: string) {
    setSelected(id);
    const res = await api<{
      conversation: Conversation;
      messages: ChatMessage[];
    }>(`/api/dashboard/conversations/${id}`);
    setMessages(res.messages || []);
    setTakeover(Boolean(res.conversation.humanTakeover));
  }

  useEffect(() => {
    loadList().catch((err) => setError(err.message));
  }, []);

  async function toggleTakeover() {
    if (!selected) return;
    await api(`/api/dashboard/conversations/${selected}`, {
      method: "PATCH",
      body: JSON.stringify({ humanTakeover: !takeover }),
    });
    await openChat(selected);
    await loadList();
  }

  async function sendOwnerReply() {
    if (!selected || !draft.trim()) return;
    await api(`/api/dashboard/conversations/${selected}/reply`, {
      method: "POST",
      body: JSON.stringify({ content: draft }),
    });
    setDraft("");
    await openChat(selected);
    await loadList();
  }

  return (
    <div className="max-w-6xl grid md:grid-cols-3 gap-4">
      <div className="bg-white border border-black/5 rounded-xl p-3 space-y-2">
        <h1 className="text-sm font-semibold px-1">Inbox</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => openChat(c.id)}
            className={`w-full text-left rounded-lg px-3 py-2 text-sm ${
              selected === c.id ? "bg-emerald-50" : "hover:bg-slate-50"
            }`}
          >
            <div className="font-medium">
              {c.customer?.name || c.customer?.phone}
            </div>
            <div className="text-slate-500 truncate">{c.lastMessage}</div>
          </button>
        ))}
        {conversations.length === 0 && (
          <p className="text-sm text-slate-400 px-1">No conversations yet.</p>
        )}
      </div>
      <div className="md:col-span-2 bg-white border border-black/5 rounded-xl p-4 min-h-[420px] flex flex-col">
        {!selected && <p className="text-slate-400 text-sm">Select a chat.</p>}
        {selected && (
          <>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium">Human takeover</span>
              <button
                onClick={toggleTakeover}
                className={`text-xs px-3 py-1 rounded-full ${
                  takeover ? "bg-amber-100 text-amber-800" : "bg-slate-100"
                }`}
              >
                {takeover ? "AI paused" : "Take over"}
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-auto">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    m.sender === "CUSTOMER"
                      ? "bg-slate-100"
                      : "bg-emerald-50 ml-auto"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    {m.sender}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="Reply as the shop owner"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendOwnerReply();
                }}
              />
              <button
                onClick={sendOwnerReply}
                className="px-4 py-2 bg-[#0f3d2e] text-white rounded-lg text-sm"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
