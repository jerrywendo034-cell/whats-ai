import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  const snapshot = store.snapshot();
  return NextResponse.json({
    business: snapshot.business,
    summary: store.summary(),
    products: store.products(),
    orders: store.orders().slice(0, 8),
    conversations: store.conversations().map((c) => {
      const messages = store.messages(c.id);
      const last = messages[messages.length - 1];
      return {
        ...c,
        customer: store.findCustomer(c.customerId),
        lastMessage: last?.content || "",
      };
    }),
  });
}
