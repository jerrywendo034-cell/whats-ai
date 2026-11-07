import { NextRequest, NextResponse } from "next/server";
import {
  parseInbound,
  sendWhatsAppText,
} from "@/lib/whatsai_meta_whatsapp_cloud";
import { handleInboundText } from "@/lib/whatsai_nextjs_whatsapp_ai_core";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(challenge || "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const inbound = parseInbound(body);

  const replies = [];
  for (const message of inbound) {
    const result = handleInboundText(message.from, message.text, message.name);
    await sendWhatsAppText(message.from, result.reply);
    replies.push(result);
  }

  return NextResponse.json({ received: true, count: inbound.length, replies });
}
