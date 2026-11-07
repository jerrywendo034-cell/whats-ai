import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  const conversations = store.conversations().map((c) => {
    const messages = store.messages(c.id);
    return {
      ...c,
      customer: store.findCustomer(c.customerId),
      lastMessage: messages[messages.length - 1]?.content || "",
    };
  });
  return NextResponse.json({ conversations });
}
