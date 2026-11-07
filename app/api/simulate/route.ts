import { NextRequest, NextResponse } from "next/server";
import { digitsPhone } from "@/lib/format";
import { store } from "@/lib/store";
import { handleInboundText } from "@/lib/whatsai_nextjs_whatsapp_ai_core";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const from = digitsPhone(body.from || "254711111111");
  const text = String(body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const result = handleInboundText(from, text, body.name || "Simulator");
  const conversation = store.findConversation(result.conversationId);
  const customer = conversation
    ? store.findCustomer(conversation.customerId)
    : null;

  return NextResponse.json({
    ...result,
    messages: store.messages(result.conversationId),
    customer,
  });
}

export async function GET(req: NextRequest) {
  const from = digitsPhone(
    new URL(req.url).searchParams.get("from") || "254711111111",
  );
  const customer = store.snapshot().customers.find((c) => c.phone === from);
  if (!customer) {
    return NextResponse.json({ messages: [], conversationId: null });
  }
  const conversation = store.getOrCreateConversation(customer.id);
  return NextResponse.json({
    conversationId: conversation.id,
    messages: store.messages(conversation.id),
  });
}
