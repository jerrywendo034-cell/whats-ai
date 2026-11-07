import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const conversation = store.findConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const content = String(body.content || "").trim();
  if (!content) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  if (!conversation.humanTakeover) {
    store.setConversation(id, {
      humanTakeover: true,
      status: "ESCALATED",
      agentType: "STORE_MANAGER",
    });
  }
  const message = store.addMessage({
    conversationId: id,
    sender: "OWNER",
    content,
  });
  return NextResponse.json({ message });
}
