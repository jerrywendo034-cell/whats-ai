import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const conversation = store.findConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    conversation: {
      ...conversation,
      customer: store.findCustomer(conversation.customerId),
    },
    messages: store.messages(id),
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await req.json();
  const conversation = store.setConversation(id, {
    humanTakeover: Boolean(body.humanTakeover),
    status: body.humanTakeover ? "ESCALATED" : "ACTIVE",
    agentType: body.humanTakeover ? "STORE_MANAGER" : conversationAgent(id),
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

function conversationAgent(id: string) {
  return store.findConversation(id)?.agentType ?? null;
}
