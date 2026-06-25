// Whats AI — Autonomous Bargaining Engine + Direct M-Pesa STK Integration
// Next.js Route Handlers, Drizzle, Better Auth
//
// Files:
//   lib/ai/agents/negotiationAgent.ts   → bargaining logic + Redis state
//   lib/ai/agents/paymentAgent.ts       → checkout + pre-push invoice
//   lib/mpesa/service.ts                → STK push + reconciliation
//   lib/mpesa/helpers.ts                → token, payload, password builders
//   app/api/mpesa/callback/route.ts     → Safaricom payment callback
//   app/api/mpesa/retry/route.ts        → customer-triggered RETRY


// ─────────────────────────────────────────────────────────────
// lib/ai/agents/negotiationAgent.ts
// The Autonomous Bargaining Engine — owner-set margin envelope,
// hard 5-round cap, sector-aware concession strategy.
// ─────────────────────────────────────────────────────────────

import { db } from "@/db";
import { negotiation, product } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { redis } from "@/lib/redis";

const NEGOTIATION_PROMPT = `You are Aria, handling a price negotiation for {business_name}.

Product: {product_name}
Listed price: KES {listed_price}
Minimum price: KES {minimum_price}
Round: {rounds_used} of {max_rounds}
Customer's offer: KES {customer_offer}
Customer type: {customer_type}

Strategy:
- Rounds 1-2: hold or small concession (KES 50-100, or a non-price perk
  like a bundled accessory or free delivery)
- Rounds 3-4: move toward middle ground
- Final round: accept if above minimum, otherwise offer minimum as final
- NEVER go below KES {minimum_price} — this is a hard cap, not a guideline
- VIP customers: reach minimum one round earlier

When max rounds are exceeded or the floor is hit without a deal, alert the
human store manager — don't keep negotiating past the cap.

Deal agreed → end with [PAYMENT]
Max rounds, no deal → end with [NEGOTIATION_FAILED]
Tone: warm, never defensive. Max 3 lines.`;

interface NegotiationState {
  productId: string;
  productName: string;
  listedPrice: number;
  minimumPrice: number;
  roundsUsed: number;
  maxRounds: number;
  currentOffer?: number;
  dbId?: string;
}

export async function buildNegotiationPrompt(business: any, customer: any, context: any): Promise<string | null> {
  const targetProduct = detectNegotiationProduct(business.products, context.currentMessage, context.history);
  if (!targetProduct || !targetProduct.negotiationEnabled) return null;

  let state: NegotiationState | null = await getNegotiationState(customer.id, targetProduct.id);

  if (!state) {
    state = {
      productId: targetProduct.id,
      productName: targetProduct.name,
      listedPrice: Number(targetProduct.price),
      minimumPrice: Number(targetProduct.minimumPrice),
      roundsUsed: 0,
      maxRounds: targetProduct.maxNegotiationRounds,
    };
  }

  state.roundsUsed += 1;

  // Hard cap enforcement — never let the engine exceed configured rounds
  if (state.roundsUsed > state.maxRounds) {
    await escalateToOwner(business, customer, targetProduct, state);
    return null; // caller falls back to a "let me check with the team" message
  }

  const offeredPrice = extractPrice(context.currentMessage);
  if (offeredPrice) state.currentOffer = offeredPrice;

  await saveNegotiationState(customer.id, targetProduct.id, state);

  // Persist to Postgres for reporting + fraud pattern detection
  const existing = await db.query.negotiation.findFirst({
    where: and(
      eq(negotiation.customerId, customer.id),
      eq(negotiation.productId, targetProduct.id),
      eq(negotiation.status, "ACTIVE"),
    ),
  });

  if (existing) {
    await db.update(negotiation).set({
      currentOffer: String(offeredPrice || state.currentOffer || state.listedPrice),
      roundsUsed: state.roundsUsed,
    }).where(eq(negotiation.id, existing.id));
  } else {
    await db.insert(negotiation).values({
      businessId: business.id,
      sectorId: targetProduct.sectorId,
      customerId: customer.id,
      productId: targetProduct.id,
      startingPrice: String(state.listedPrice),
      currentOffer: String(offeredPrice || state.listedPrice),
      minimumPrice: String(state.minimumPrice),
      roundsUsed: state.roundsUsed,
      maxRounds: state.maxRounds,
      status: "ACTIVE",
    });
  }

  await redis.setex(`neg_active:${customer.id}`, 86400, JSON.stringify(state));

  return NEGOTIATION_PROMPT
    .replace("{business_name}", business.businessName)
    .replace("{product_name}", targetProduct.name)
    .replace("{listed_price}", String(state.listedPrice))
    .replace("{minimum_price}", String(state.minimumPrice))
    .replace("{rounds_used}", String(state.roundsUsed))
    .replace("{max_rounds}", String(state.maxRounds))
    .replace("{customer_offer}", String(state.currentOffer ?? "not specified"))
    .replace("{customer_type}", customer.customerType);
}

async function getNegotiationState(customerId: string, productId: string): Promise<NegotiationState | null> {
  const data = await redis.get(`neg_state:${customerId}:${productId}`);
  return data ? JSON.parse(data) : null;
}

async function saveNegotiationState(customerId: string, productId: string, state: NegotiationState) {
  await redis.setex(`neg_state:${customerId}:${productId}`, 86400, JSON.stringify(state));
}

function extractPrice(text: string): number | null {
  const match = text.match(/(?:kes\s?)?(\d[\d,]+)/i);
  if (!match) return null;
  const price = parseInt(match[1].replace(/,/g, ""), 10);
  return price > 100 ? price : null;
}

function detectNegotiationProduct(products: any[], currentMessage: string, history: any[]) {
  const allText = [...history.map((m: any) => m.content), currentMessage].join(" ").toLowerCase();
  for (const p of products) {
    if (allText.includes(p.name.toLowerCase())) return p;
  }
  return products.find((p: any) => p.negotiationEnabled) || null;
}

async function escalateToOwner(business: any, customer: any, product: any, state: NegotiationState) {
  const { WhatsAppService } = await import("@/lib/whatsapp");
  await WhatsAppService.sendToOwner(business.whatsappNumber, {
    type: "ESCALATION",
    customerName: customer.name || customer.phone,
    customerPhone: customer.phone,
    customerMessage: `Negotiation on ${product.name} hit the ${state.maxRounds}-round cap without a deal. Last offer: KES ${state.currentOffer}.`,
  });
}


// ─────────────────────────────────────────────────────────────
// lib/ai/agents/paymentAgent.ts
// Checkout flow with Pre-Push Invoice (v2.1 requirement)
// ─────────────────────────────────────────────────────────────

import { order, orderItem } from "@/db/schema";
import { redis as redisClient } from "@/lib/redis";

const PAYMENT_PROMPT = `You are Aria, checkout assistant for {business_name}.

Order summary:
{order_summary}
Total: KES {total}

PRE-PUSH INVOICE — always send this exact structured format FIRST, and wait
for explicit confirmation before pushing payment:

"Here's your order summary:
{order_summary}
Delivery: KES {delivery_fee}
Total: KES {total}

Reply CONFIRM and I'll send the M-Pesa request to {customer_phone}."

Only after the customer confirms, end your response with [INITIATE_STK_PUSH].

For weight-based items: mark the total as an ESTIMATE explicitly and do not
push payment — checkout halts until the business owner confirms actual
weight on the dashboard (see weight-adjustment flow in v2.1 addendum).

Never ask for M-Pesa PIN directly. Max 3 lines per message beyond the
invoice block itself.`;

export async function buildPaymentPrompt(business: any, customer: any, context: any): Promise<string> {
  const negData = await redisClient.get(`neg_active:${customer.id}`);
  const negotiationState = negData ? JSON.parse(negData) : null;

  const targetProduct = detectProductFromHistory(business.products, context.history);
  const price = negotiationState?.currentOffer || Number(targetProduct?.price || 0);

  const orderSummary = targetProduct
    ? `${targetProduct.name} x1 — KES ${price}`
    : "Item as discussed";

  return PAYMENT_PROMPT
    .replace("{business_name}", business.businessName)
    .replace(/{order_summary}/g, orderSummary)
    .replace("{total}", String(price))
    .replace("{delivery_fee}", "0")
    .replace("{customer_phone}", customer.phone);
}

function detectProductFromHistory(products: any[], history: any[]) {
  const allText = history.map((m: any) => m.content).join(" ").toLowerCase();
  for (const p of products) {
    if (allText.includes(p.name.toLowerCase())) return p;
  }
  return products[0] || null;
}


// ─────────────────────────────────────────────────────────────
// lib/mpesa/helpers.ts
// ─────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getMpesaToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const res = await fetch("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`M-Pesa token fetch failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in) - 60) * 1000;
  return cachedToken!;
}

export function buildTimestamp(): string {
  return new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
}

export function buildPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

export function buildSTKPayload(params: {
  till?: string; paybill?: string; account?: string; phone: string; amount: number;
  orderId: string; timestamp: string; passkey: string; shortcode: string; callbackUrl: string;
}) {
  const password = buildPassword(params.shortcode, params.passkey, params.timestamp);
  const transactionType = params.till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";
  const partyB = params.till || params.paybill!;

  return {
    BusinessShortCode: params.shortcode,
    Password: password,
    Timestamp: params.timestamp,
    TransactionType: transactionType,
    Amount: params.amount,
    PartyA: params.phone,
    PartyB: partyB,
    PhoneNumber: params.phone,
    CallBackURL: params.callbackUrl,
    AccountReference: params.account || `Order-${params.orderId.slice(-6)}`,
    TransactionDesc: `Payment for order ${params.orderId.slice(-6).toUpperCase()}`,
  };
}


// ─────────────────────────────────────────────────────────────
// lib/mpesa/service.ts
// STK push, callback handling, retry, and the v2.1 anti-spoofing guard
// ─────────────────────────────────────────────────────────────

import { db as database } from "@/db";
import { payment, order as orderTable, customer as customerTable, product as productTable, business as businessTable, fraudFlag } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redis as redisConn } from "@/lib/redis";
import { WhatsAppService as WAService } from "@/lib/whatsapp";
import { getMpesaToken, buildTimestamp, buildSTKPayload } from "./helpers";

export const MpesaService = {

  async sendSTKPush({ phone, amount, orderId, biz }: { phone: string; amount: number; orderId: string; biz: any }) {
    const normalisedPhone = normalisePhone(phone);
    const token = await getMpesaToken();
    const timestamp = buildTimestamp();

    const payload = buildSTKPayload({
      till: biz.mpesaTill, paybill: biz.mpesaPaybill, account: biz.mpesaAccount || biz.businessName,
      phone: normalisedPhone, amount: Math.ceil(amount), orderId, timestamp,
      passkey: process.env.MPESA_PASSKEY!,
      shortcode: biz.mpesaTill || biz.mpesaPaybill,
      callbackUrl: `${process.env.APP_URL}/api/mpesa/callback`,
    });

    const res = await fetch("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.ResponseCode !== "0") {
      throw new Error(`STK Push failed: ${data.errorMessage || data.ResponseDescription}`);
    }

    await database.insert(payment).values({
      orderId, phone: normalisedPhone, amount: String(amount), status: "PENDING",
      checkoutRequestId: data.CheckoutRequestID,
    }).onConflictDoUpdate({
      target: payment.orderId,
      set: { checkoutRequestId: data.CheckoutRequestID, status: "PENDING" },
    });

    await redisConn.setex(`mpesa_checkout:${data.CheckoutRequestID}`, 300, JSON.stringify({ orderId, businessId: biz.id }));

    // 60-second timeout fallback (v2.1) — fires the RETRY recovery message
    setTimeout(() => this.handleTimeout(data.CheckoutRequestID, orderId, biz), 60_000);

    return { checkoutRequestId: data.CheckoutRequestID };
  },

  async retrySTKPush(orderId: string, biz: any) {
    const ord = await database.query.order.findFirst({
      where: eq(orderTable.id, orderId),
      with: { customer: true },
    });
    if (!ord) throw new Error("Order not found for retry");

    return this.sendSTKPush({
      phone: (ord as any).customer.phone,
      amount: Number(ord.finalTotal || ord.total),
      orderId: ord.id,
      biz,
    });
  },

  async handleSuccess({ checkoutRequestId, mpesaReceipt, amount, phone }: any) {
    const cached = await redisConn.get(`mpesa_checkout:${checkoutRequestId}`);
    if (!cached) return;
    const { orderId } = JSON.parse(cached);

    await database.update(payment).set({
      status: "SUCCESS", mpesaReceipt, amount: String(amount), paymentDate: new Date(),
    }).where(eq(payment.orderId, orderId));

    const [ord] = await database.update(orderTable).set({ status: "PAID" }).where(eq(orderTable.id, orderId)).returning();

    await redisConn.del(`mpesa_checkout:${checkoutRequestId}`);

    const biz = await database.query.business.findFirst({ where: eq(businessTable.id, ord.businessId) });
    if (biz) {
      await WAService.sendToOwner(biz.whatsappNumber, {
        type: "NEW_ORDER", customerName: phone, productName: "order", total: amount,
        orderId: ord.id.slice(-6).toUpperCase(),
      });
    }

    return ord;
  },

  async handleFailure({ checkoutRequestId }: any) {
    const cached = await redisConn.get(`mpesa_checkout:${checkoutRequestId}`);
    if (!cached) return;
    const { orderId } = JSON.parse(cached);
    await database.update(payment).set({ status: "FAILED" }).where(eq(payment.orderId, orderId));
    await redisConn.del(`mpesa_checkout:${checkoutRequestId}`);
  },

  // v2.1 — STK timeout fallback with RETRY / manual Till message
  async handleTimeout(checkoutRequestId: string, orderId: string, biz: any) {
    const stillPending = await redisConn.get(`mpesa_checkout:${checkoutRequestId}`);
    if (!stillPending) return; // already resolved by real callback

    await database.update(payment).set({ status: "TIMEOUT" }).where(eq(payment.orderId, orderId));

    const ord = await database.query.order.findFirst({ where: eq(orderTable.id, orderId), with: { customer: true } });
    if (!ord) return;

    const tillDisplay = biz.mpesaTill || biz.mpesaPaybill;
    await WAService.sendToCustomer(
      (ord as any).customer.phone,
      `It looks like the secure M-Pesa prompt didn't appear on your screen. No problem! Reply RETRY to trigger a fresh prompt, or pay manually using our Till Number: ${tillDisplay}.`
    );
  },

  // v2.1 — anti-spoofing guard: customer claims payment via pasted text/screenshot
  // This NEVER changes order status on its own — only the real Safaricom
  // callback in handleSuccess() can do that.
  async handlePaymentClaim({ orderId, businessId, customerId, claimText }: any) {
    const existingPayment = await database.query.payment.findFirst({ where: eq(payment.orderId, orderId) });

    if (existingPayment?.status === "SUCCESS") {
      return { alreadyConfirmed: true };
    }

    await database.insert(fraudFlag).values({
      businessId, customerId, signalType: "PAYMENT_CLAIM_UNVERIFIED", severity: "HARD",
      details: { orderId, claimText },
    });

    return { alreadyConfirmed: false, flagged: true };
  },
};

function normalisePhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (clean.startsWith("254")) return clean;
  if (clean.startsWith("0")) return `254${clean.slice(1)}`;
  if (clean.startsWith("7") || clean.startsWith("1")) return `254${clean}`;
  return clean;
}


// ─────────────────────────────────────────────────────────────
// app/api/mpesa/callback/route.ts
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { MpesaService } from "@/lib/mpesa/service";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Always 200 immediately — Safaricom retries on anything else
  const callback = body?.Body?.stkCallback;
  if (!callback) return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

  const { CheckoutRequestID, ResultCode, CallbackMetadata } = callback;

  if (ResultCode === 0) {
    const meta = extractMetadata(CallbackMetadata?.Item || []);
    await MpesaService.handleSuccess({
      checkoutRequestId: CheckoutRequestID,
      mpesaReceipt: meta.MpesaReceiptNumber,
      amount: meta.Amount,
      phone: String(meta.PhoneNumber),
    }).catch((err) => console.error("M-Pesa success handling error:", err));
  } else {
    await MpesaService.handleFailure({ checkoutRequestId: CheckoutRequestID }).catch((err) =>
      console.error("M-Pesa failure handling error:", err)
    );
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

function extractMetadata(items: any[]) {
  const result: Record<string, any> = {};
  for (const item of items) result[item.Name] = item.Value;
  return result;
}


// ─────────────────────────────────────────────────────────────
// app/api/mpesa/retry/route.ts
// Called when the customer replies RETRY after a timeout message
// ─────────────────────────────────────────────────────────────

import { NextRequest as NextReq, NextResponse as NextRes } from "next/server";
import { MpesaService as MpesaSvc } from "@/lib/mpesa/service";
import { db as dbConn } from "@/db";
import { business as businessTbl } from "@/db/schema";
import { eq as equals } from "drizzle-orm";

export async function POST(req: NextReq) {
  const { orderId, businessId } = await req.json();

  const biz = await dbConn.query.business.findFirst({ where: equals(businessTbl.id, businessId) });
  if (!biz) return NextRes.json({ error: "Business not found" }, { status: 404 });

  try {
    const result = await MpesaSvc.retrySTKPush(orderId, biz);
    return NextRes.json({ success: true, checkoutRequestId: result.checkoutRequestId });
  } catch (err: any) {
    return NextRes.json({ error: err.message }, { status: 500 });
  }
}


// ─────────────────────────────────────────────────────────────
// Required env vars (.env.local) — M-Pesa specific
// ─────────────────────────────────────────────────────────────

/*
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_PASSKEY=...
APP_URL=https://your-app.vercel.app
*/


// ─────────────────────────────────────────────────────────────
// Sandbox test flow
// ─────────────────────────────────────────────────────────────

/*
Sandbox test number: 254708374149
Sandbox PIN: any 4 digits
Sandbox shortcode: 174379

1. Get sandbox token from sandbox.safaricom.co.ke instead of api.safaricom.co.ke
2. Send a test STK push for KES 1
3. Safaricom auto-completes with ResultCode 0 in sandbox
4. Verify: payment row → SUCCESS, order row → PAID, owner gets WhatsApp alert
5. Test the timeout path by NOT completing the sandbox prompt — confirm the
   RETRY message fires after 60 seconds and that replying RETRY triggers
   a fresh push via /api/mpesa/retry
*/
