import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "Whats AI webhook is running",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  console.log("Incoming WhatsApp message:", body);

  return NextResponse.json({
    received: true,
  });
}