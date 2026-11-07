import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ business: store.business() });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const business = store.updateBusiness({
    aiEnabled: body.aiEnabled ?? store.business().aiEnabled,
    negotiationEnabled:
      body.negotiationEnabled ?? store.business().negotiationEnabled,
    mpesaTill: body.mpesaTill ?? store.business().mpesaTill,
    businessName: body.businessName ?? store.business().businessName,
  });
  return NextResponse.json({ business });
}
