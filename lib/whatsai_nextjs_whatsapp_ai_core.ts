// Whats AI — WhatsApp Business API Core + AI Core Service Assistant
// Next.js Route Handlers (App Router), Drizzle, Better Auth
//
// Files:
//   app/api/webhook/whatsapp/route.ts   → receives messages from Africa's Talking
//   lib/ai/messageProcessor.ts          → orchestration pipeline
//   lib/ai/agentRouter.ts               → classifier + sector routing + agent dispatch
//   lib/ai/claudeClient.ts              → Claude API wrapper
//   lib/ai/agents/salesAgent.ts         → sales prompt builder
//   lib/whatsapp.ts                     → outbound WhatsApp sender


// ─────────────────────────────────────────────────────────────
// app/api/webhook/whatsapp/route.ts
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { MessageProcessor } from "@/lib/ai/messageProcessor";

export async function POST(req: NextRequest) {
  const payload = await req.json();

  // Acknowledge immediately — Africa's Talking expects a fast 200
  // Process async after responding (Next.js keeps the function alive
  // via `after()` from next/server, available in Next.js 15+)
  const message = parseATMessage(payload);

  if (!message) {
    return NextResponse.json({ received: true });
  }

  // Fire and forget — don't block the response on AI processing
  MessageProcessor.handle(message).catch((err) => {
    console.error("Webhook processing error:", err);
  });

  return NextResponse.json({ received: true });
}

function parseATMessage(payload: any) {
  try {
    const data = payload.data || payload;
    return {
      from: data.from || data.phoneNumber,
      to: data.to,
      text: data.text || data.message || "",
      messageType: data.mediaUrl ? (data.mediaType === "audio" ? "VOICE" : "IMAGE") : "TEXT",
      mediaUrl: data.mediaUrl || null,
      timestamp: data.timestamp || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// Verify the request came from Africa's Talking — call this inside POST
// before processing, using a header secret configured in your AT dashboard
function verifyATRequest(req: NextRequest): boolean {
  const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key");
  return apiKey === process.env.AT_WEBHOOK_SECRET;
}


// ─────────────────────────────────────────────────────────────
// lib/ai/messageProcessor.ts
// The full pipeline: find business → customer → conversation →
// transcribe voice if needed → route to agent → send reply
// ─────────────────────────────────────────────────────────────

import { db } from "@/db";
import { business, customer, conversation, message as messageTable, product } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { AgentRouter } from "./agentRouter";
import { WhatsAppService } from "@/lib/whatsapp";
import { VoiceTranscription } from "./voiceTranscription";
import { ResponseHandler } from "./responseHandler";

interface IncomingMessage {
  from: string;
  to: string;
  text: string;
  messageType: "TEXT" | "IMAGE" | "VOICE";
  mediaUrl: string | null;
}

export const MessageProcessor = {

  async handle(msg: IncomingMessage) {
    const { from, to } = msg;
    let { text } = msg;

    // ── 1. Find the business by WhatsApp number ────────────────
    const biz = await db.query.business.findFirst({
      where: eq(business.whatsappNumber, to),
      with: {
        products: { where: eq(product.isActive, true), with: { variants: true } },
        sectors: true,
      },
    });

    if (!biz || !biz.aiEnabled) return;

    // ── 2. Transcribe voice notes before anything else ─────────
    if (msg.messageType === "VOICE" && msg.mediaUrl) {
      try {
        const transcript = await VoiceTranscription.transcribe(msg.mediaUrl);
        text = transcript ? `[VOICE] ${transcript}` : "";
        if (!text) {
          await WhatsAppService.sendToCustomer(from, "Sorry, I didn't quite catch that — could you say it again or type it out?");
          return;
        }
      } catch (err) {
        console.error("Transcription failed:", err);
        await WhatsAppService.sendToCustomer(from, "Sorry, I didn't quite catch that — could you type it instead?");
        return;
      }
    }

    // ── 3. Find or create customer ──────────────────────────────
    let cust = await db.query.customer.findFirst({
      where: and(eq(customer.businessId, biz.id), eq(customer.phone, from)),
    });

    if (!cust) {
      const [created] = await db.insert(customer).values({
        businessId: biz.id,
        phone: from,
        customerType: "NEW",
        optedIn: true,
        lastSeenAt: new Date(),
      }).returning();
      cust = created;
    } else {
      await db.update(customer).set({ lastSeenAt: new Date() }).where(eq(customer.id, cust.id));
    }

    // ── 4. Find or create conversation ──────────────────────────
    let conv = await db.query.conversation.findFirst({
      where: and(
        eq(conversation.businessId, biz.id),
        eq(conversation.customerId, cust.id),
        eq(conversation.status, "ACTIVE"),
      ),
    });

    let isNewConversation = false;
    if (!conv) {
      const [created] = await db.insert(conversation).values({
        businessId: biz.id,
        customerId: cust.id,
        status: "ACTIVE",
      }).returning();
      conv = created;
      isNewConversation = true;
    }

    // ── 5. Human override (step-aside) check ────────────────────
    if (conv.humanOverrideUntil && new Date() < new Date(conv.humanOverrideUntil)) {
      // Just log the customer's message — AI stays silent
      await db.insert(messageTable).values({
        conversationId: conv.id, sender: "CUSTOMER", messageType: msg.messageType, content: text, mediaUrl: msg.mediaUrl,
      });
      return;
    }

    // ── 6. Save incoming message ─────────────────────────────────
    await db.insert(messageTable).values({
      conversationId: conv.id, sender: "CUSTOMER", messageType: msg.messageType, content: text, mediaUrl: msg.mediaUrl,
    });

    // ── 7. Device Empathy — one-time storage tip on first message ─
    let device_tip = "";
    if (isNewConversation && !conv.deviceTipShown) {
      device_tip = `\n\n💡 Quick tip: to save your phone's storage while I share product photos, you can turn off 'Media Visibility' for this chat in WhatsApp settings.`;
      await db.update(conversation).set({ deviceTipShown: true }).where(eq(conversation.id, conv.id));
    }

    // ── 8. Load history ───────────────────────────────────────────
    const history = await db.query.message.findMany({
      where: eq(messageTable.conversationId, conv.id),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
      limit: 10,
    });

    const claudeHistory = history.map((m) => ({
      role: m.sender === "CUSTOMER" ? "user" as const : "assistant" as const,
      content: m.content,
    }));

    // ── 9. Route to the correct agent ───────────────────────────
    const agentResponse = await AgentRouter.route({
      business: biz, customer: cust, conversation: conv,
      currentMessage: text, history: claudeHistory,
    });

    if (agentResponse.skipResponse) return; // human override or similar

    // ── 10. Parse action tags, save + send response ──────────────
    const { cleanResponse, actions } = ResponseHandler.parseActions(agentResponse.text || "");
    const finalText = cleanResponse + device_tip;

    await db.insert(messageTable).values({
      conversationId: conv.id, sender: "AI", messageType: "TEXT", content: finalText,
    });

    await db.update(conversation).set({ agentType: agentResponse.agentUsed }).where(eq(conversation.id, conv.id));

    await WhatsAppService.sendToCustomer(from, finalText);

    // ── 11. Execute side effects (STK push, escalation, etc.) ────
    await ResponseHandler.executeActions(actions, { business: biz, customer: cust, conversation: conv, currentMessage: text });
  },
};


// ─────────────────────────────────────────────────────────────
// lib/ai/claudeClient.ts
// ─────────────────────────────────────────────────────────────

interface ClaudeCallOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function callClaude({ model, maxTokens, system, messages }: ClaudeCallOptions): Promise<string> {
  const body: any = {
    model: model || "claude-haiku-4-5-20251001",
    max_tokens: maxTokens || 300,
    messages,
  };
  if (system) body.system = system;

  let attempts = 0;
  while (attempts < 3) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 529 || res.status === 503) {
        await new Promise((r) => setTimeout(r, 1000 * (attempts + 1)));
        attempts++;
        continue;
      }
      if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);

      const data = await res.json();
      return data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    } catch (err) {
      attempts++;
      if (attempts >= 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempts));
    }
  }
  throw new Error("Claude call failed after retries");
}


// ─────────────────────────────────────────────────────────────
// lib/ai/agentRouter.ts
// The AI Core Service Assistant — classifier, sector routing, dispatch
// ─────────────────────────────────────────────────────────────

import { redis } from "@/lib/redis";
import { callClaude } from "./claudeClient";
import { SectorRouter } from "./sectorRouter";
import { FraudDetection } from "./fraudDetection";
import { buildSalesPrompt } from "./agents/salesAgent";
import { buildNegotiationPrompt } from "./agents/negotiationAgent";
import { buildSupportPrompt } from "./agents/supportAgent";
import { buildPaymentPrompt } from "./agents/paymentAgent";

const CLASSIFIER_PROMPT = `You are a message router for a WhatsApp sales assistant.
Given the customer's message, return ONLY one word — no explanation:

SALES — browsing, asking about products, prices, availability
NEGOTIATE — asking for a discount, lower price, "too expensive"
SUPPORT — asking about an existing order, delivery, payment already made
PAYMENT — confirming they want to buy, ready to pay

Message: "{message}"`;

export const AgentRouter = {

  async route({ business, customer, conversation, currentMessage, history }: any) {

    // Step 1 — Sector routing for COMPLEX businesses
    if (business.businessMode === "COMPLEX") {
      const sectorDecision = await SectorRouter.route({ business, conversation, currentMessage });
      if (sectorDecision.needsMenu) {
        return { text: SectorRouter.buildSectorMenu(business, sectorDecision.sectors), agentUsed: "SECTOR_ROUTER" };
      }
      if (sectorDecision.confirmSwitch) {
        return {
          text: `You were looking at something else. Want me to save that and show you ${sectorDecision.targetSector.name}?`,
          agentUsed: "SECTOR_ROUTER",
        };
      }
    }

    // Step 2 — fraud soft-block check
    const softBlocked = await FraudDetection.isNegotiationSoftBlocked(customer.id);

    // Step 3 — active negotiation override
    const activeNeg = await redis.get(`neg_active:${customer.id}`);
    if (activeNeg && !softBlocked) {
      return this.callAgent("NEGOTIATE", { business, customer, conversation, currentMessage, history });
    }

    // Step 4 — classify
    const agentType = await this.classify(currentMessage);
    const finalType = agentType === "NEGOTIATE" && softBlocked ? "SALES" : agentType;

    return this.callAgent(finalType, { business, customer, conversation, currentMessage, history });
  },

  async classify(message: string): Promise<string> {
    try {
      const response = await callClaude({
        model: "claude-haiku-4-5-20251001",
        maxTokens: 10,
        messages: [{ role: "user", content: CLASSIFIER_PROMPT.replace("{message}", message) }],
      });
      const result = response.trim().toUpperCase();
      const valid = ["SALES", "NEGOTIATE", "SUPPORT", "PAYMENT"];
      return valid.includes(result) ? result : "SALES";
    } catch {
      return "SALES";
    }
  },

  async callAgent(agentType: string, context: any) {
    const { business, customer, currentMessage, history, conversation } = context;
    let systemPrompt: string | null;

    switch (agentType) {
      case "NEGOTIATE": systemPrompt = await buildNegotiationPrompt(business, customer, context); break;
      case "SUPPORT": systemPrompt = await buildSupportPrompt(business, customer); break;
      case "PAYMENT": systemPrompt = await buildPaymentPrompt(business, customer, context); break;
      default: systemPrompt = buildSalesPrompt(business, customer, conversation?.currentSectorId); break;
    }

    const messages = [...history, { role: "user" as const, content: currentMessage }];

    const text = await callClaude({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 300,
      system: systemPrompt ?? undefined,
      messages,
    });

    return { text, agentUsed: agentType };
  },
};


// ─────────────────────────────────────────────────────────────
// lib/ai/agents/salesAgent.ts
// ─────────────────────────────────────────────────────────────

const SALES_PROMPT_TEMPLATE = `You are Aria, an AI employee for {business_name} on WhatsApp — not a chatbot.
You speak from the business's own WhatsApp number.

Personality: warm, helpful, conversational. Reply in English, Swahili, or
Sheng matching the customer. Keep messages short — max 4 lines.

Device empathy: never push large raw images. Prefer compact catalog cards.

Products available:
{product_catalog}

Customer: {customer_name} · Type: {customer_type} · Past orders: {order_count}

Your job: help customers find what they need, share price/sizes/stock
clearly, suggest related products, push gently toward purchase.

If customer asks for a discount → end with [NEGOTIATE]
If customer confirms they want to buy → end with [PAYMENT]
Never quote prices below listed price. Never invent products.`;

export function buildSalesPrompt(business: any, customer: any, sectorId?: string | null): string {
  const products = sectorId
    ? business.products.filter((p: any) => p.sectorId === sectorId)
    : business.products;

  const catalog = formatCatalog(products);

  return SALES_PROMPT_TEMPLATE
    .replace("{business_name}", business.businessName)
    .replace("{product_catalog}", catalog)
    .replace("{customer_name}", customer.name || "there")
    .replace("{customer_type}", customer.customerType)
    .replace("{order_count}", String(customer.ordersCount));
}

function formatCatalog(products: any[]): string {
  if (!products?.length) return "No products available yet.";
  return products.map((p) => {
    const variants = p.variants?.length
      ? `Sizes/colours: ${p.variants.map((v: any) => `${v.size || ""} ${v.color || ""}`.trim()).join(", ")}`
      : "";
    const stockNote = p.stock <= 3 ? ` (only ${p.stock} left!)` : "";
    const negotiable = p.negotiationEnabled ? " [negotiable]" : "";
    return `- ${p.name}: KES ${p.price}${negotiable}${stockNote}. ${variants}`.trim();
  }).join("\n");
}


// ─────────────────────────────────────────────────────────────
// lib/whatsapp.ts
// ─────────────────────────────────────────────────────────────

export const WhatsAppService = {
  async sendToCustomer(phone: string, text: string) {
    const res = await fetch("https://api.africastalking.com/version1/messaging/whatsapp", {
      method: "POST",
      headers: { apiKey: process.env.AT_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ username: process.env.AT_USERNAME, to: phone, message: text, channel: "whatsapp" }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed: ${await res.text()}`);
    return res.json();
  },

  async sendToOwner(whatsappNumber: string, payload: { type: string; [key: string]: any }) {
    const text = this.buildOwnerMessage(payload);
    return this.sendToCustomer(whatsappNumber, text);
  },

  buildOwnerMessage(payload: any): string {
    switch (payload.type) {
      case "ESCALATION":
        return `🚨 Customer needs your help\n\n${payload.customerName} has an issue:\n"${payload.customerMessage}"\n\nReply directly: ${payload.customerPhone}`;
      case "NEW_ORDER":
        return `📦 New order!\n\nCustomer: ${payload.customerName}\nProduct: ${payload.productName}\nTotal: KES ${payload.total}\n\nOrder #${payload.orderId}`;
      default:
        return payload.text || "Message from Whats AI.";
    }
  },
};


// ─────────────────────────────────────────────────────────────
// Required env vars (.env.local)
// ─────────────────────────────────────────────────────────────

/*
DATABASE_URL=postgres://...           # Vercel Postgres
ANTHROPIC_API_KEY=sk-ant-...
AT_API_KEY=...
AT_USERNAME=...
AT_WEBHOOK_SECRET=...
STT_API_URL=...                       # speech-to-text provider for voice notes
STT_API_KEY=...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://your-app.vercel.app
*/
