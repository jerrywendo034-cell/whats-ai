import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  const orders = store.orders().map((order) => ({
    ...order,
    customer: store.findCustomer(order.customerId),
    product: store.findProduct(order.productId),
  }));
  return NextResponse.json({ orders });
}
