import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ products: store.products() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name || "").trim();
  const price = Number(body.price);
  if (!name || !Number.isFinite(price) || price <= 0) {
    return NextResponse.json(
      { error: "Name and a valid price are required." },
      { status: 400 },
    );
  }

  const product = store.addProduct({
    name,
    description: String(body.description || ""),
    category: String(body.category || "General"),
    price,
    minimumPrice: Number(body.minimumPrice || price),
    stock: Number(body.stock || 0),
    negotiationEnabled: Boolean(body.negotiationEnabled),
  });

  return NextResponse.json({ product });
}
