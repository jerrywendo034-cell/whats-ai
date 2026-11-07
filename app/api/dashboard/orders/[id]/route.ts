import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import type { OrderStatus } from "@/lib/types";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "PACKED",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await req.json();
  const status = body.status as OrderStatus;
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const order = store.updateOrder(id, { status });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ order });
}
