// Whats AI — WhatsApp Cloud API (Meta) Version
// Replaces Africa's Talking with Meta's Graph API.
//
// FILES THAT CHANGED (replace these):
//   app/api/webhook/whatsapp/route.ts   ← full rewrite
//   lib/whatsapp.ts                     ← full rewrite
//   lib/ai/messageProcessor.ts          ← voice note section updated
//
// FILES THAT STAY EXACTLY THE SAME (do not touch):
//   lib/ai/claudeClient.ts
//   lib/ai/agentRouter.ts
//   lib/ai/agents/salesAgent.ts
//   lib/ai/agents/negotiationAgent.ts
//   lib/ai/agents/paymentAgent.ts
//   lib/ai/agents/supportAgent.ts
//   lib/ai/sectorRouter.ts
//   lib/ai/fraudDetection.ts
//   lib/ai/responseHandler.ts
//   lib/mpesa/service.ts
//   lib/mpesa/helpers.ts
//   app/api/mpesa/callback/route.ts
//   app/api/mpesa/retry/route.ts
//   db/schema.ts (no schema changes needed)


// ─────────────────────────────────────────────────────────────
// NEW ENV VARS — replace your .env.local with these
// (remove all the AT_ variables)
// ─────────────────────────────────────────────────────────────

/*
# Database (unchanged)
DATABASE_URL=postgres://...

# Redis (unchanged)
UPSTASH_REDIS_REST_URL=https://....upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# Better Auth (unchanged)
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://your-app.vercel.app

# AI (unchanged)
ANTHROPIC_API_KEY=sk-ant-...

# Voice transcription (unchanged)
STT_API_URL=...
STT_API_KEY=...

# M-Pesa (unchanged)
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_PASSKEY=...
APP_URL=https://your-app.vercel.app

# ── META WHATSAPP CLOUD API (replaces all AT_ variables) ──────
#
# Where to get these:
#   1. META_PHONE_NUMBER_ID
#      → developers.facebook.com → your app → WhatsApp → API Setup
#      → "Phone Number ID" (NOT the actual number, it looks like "103843490657983")
#
#   2. META_ACCESS_TOKEN
#      → Same page → "Temporary access token" for testing
#      → For production: create a System User in Business Manager and use a permanent token
#
#   3. META_WEBHOOK_VERIFY_TOKEN
#      → Make up any long random string (e.g. run: openssl rand -base64 32)
#      → You will paste this same string into the Meta dashboard when registering the webhook
#
#   4. META_APP_SECRET
#      → developers.facebook.com → your app → App Settings → Basic → App Secret
#      → Used to verify that webhook POST requests really came from Meta

META_PHONE_NUMBER_ID=103843490657983
META_ACCESS_TOKEN=EAAxxxxxxxxxx...
META_WEBHOOK_VERIFY_TOKEN=your_random_string_here
META_APP_SECRET=your_app_secret_here
META_API_VERSION=v20.0
*/


// ─────────────────────────────────────────────────────────────
// HOW TO REGISTER THE WEBHOOK WITH META
// (one-time setup in the Meta developer dashboard)
// ─────────────────────────────────────────────────────────────

/*
1. Go to: developers.facebook.com → your app → WhatsApp → Configuration

2. Under "Webhook", click "Edit"

3. Set:
   Callback URL: https://your-app.vercel.app/api/webhook/whatsapp
   Verify token:  (paste your META_WEBHOOK_VERIFY_TOKEN value)

4. Click "Verify and save" — Meta sends a GET request to your webhook.
   Your route.ts GET handler returns the challenge, Meta confirms.

5. Under "Webhook fields", subscribe to: messages

That's it. Meta now sends every incoming message to your webhook.
*/


// ═════════════════════════════════════════════════════════════
// FILE 1 — app/api/webhook/whatsapp/route.ts  [FULL REWRITE]
// ═════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { MessageProcessor } from "@/lib/ai/messageProcessor";

// ── GET: Meta webhook verification ──────────────────────────
// Meta sends this once when you register/edit your webhook.
// We must return hub.challenge if hub.verify_token matches.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("Meta webhook verified ✓");
    // Return the challenge as plain text — Meta requires this exact format
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// ── POST: Incoming messages from Meta ───────────────────────
export async function POST(req: NextRequest) {
  // Read raw body first — we need it for HMAC verification
  // before we parse JSON. MUST read as text, not as json().
  const rawBody = await req.text();

  // Verify the signature — every POST from Meta includes this header.
  // If it doesn't match, someone is faking requests to your endpoint.
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    console.warn("Webhook: invalid Meta signature — request rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Always return 200 immediately — Meta will retry if we don't respond fast.
  // Parse and process async after the response is sent.
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  // Extract and process each message — Meta batches multiple changes
  // in a single POST, so we loop through all of them.
  const messages = extractMetaMessages(payload);

  for (const message of messages) {
    MessageProcessor.handle(message).catch((err) => {
      console.error("Webhook processing error:", err);
    });
  }

  return NextResponse.json({ received: true });
}

// ── Signature verification ───────────────────────────────────
// Meta signs every POST with HMAC-SHA256 using your App Secret.
// Header format: "sha256=<hex_hash>"
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // If APP_SECRET is not set, skip verification in dev but warn loudly
    console.warn("META_APP_SECRET not set — skipping signature verification (dev only)");
    return true;
  }

  const expected = "sha256=" + createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  // timingSafeEqual prevents timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(signatureHeader, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

// ── Parse Meta's nested payload into our flat IncomingMessage format ──
// Meta payload structure:
// payload.entry[].changes[].value.messages[]
//
// Messages can be: text, audio (voice), image, video, document, sticker
// Status updates (delivered, read) arrive in the same payload — we skip those.
function extractMetaMessages(payload: any): Array<{
  from: string;
  to: string;  // business's WhatsApp number (display_phone_number from metadata)
  text: string;
  messageType: "TEXT" | "IMAGE" | "VOICE";
  mediaId: string | null;  // Meta media ID (not a URL — needs resolution)
  mediaUrl: null;           // always null for Meta — resolved later in MessageProcessor
  timestamp: string;
}> {
  const result: any[] = [];

  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages) continue;  // skip status updates, etc.

        const displayPhoneNumber = value.metadata?.display_phone_number;
        if (!displayPhoneNumber) continue;

        for (const msg of value.messages) {
          // Skip non-message types (reactions, read receipts, etc.)
          if (!["text", "audio", "voice", "image"].includes(msg.type)) continue;

          let text = "";
          let messageType: "TEXT" | "IMAGE" | "VOICE" = "TEXT";
          let mediaId: string | null = null;

          switch (msg.type) {
            case "text":
              text = msg.text?.body || "";
              messageType = "TEXT";
              break;

            case "audio":
            case "voice":
              // Meta gives a media ID, NOT a URL.
              // MessageProcessor will resolve this to a URL using the Graph API.
              mediaId = msg.audio?.id || msg.voice?.id || null;
              messageType = "VOICE";
              text = "";  // filled in after transcription
              break;

            case "image":
              mediaId = msg.image?.id || null;
              messageType = "IMAGE";
              text = msg.image?.caption || "";
              break;
          }

          result.push({
            from: msg.from,                // customer's WhatsApp number
            to: displayPhoneNumber,         // business's WhatsApp number → business lookup
            text,
            messageType,
            mediaId,
            mediaUrl: null,
            timestamp: msg.timestamp || new Date().toISOString(),
          });
        }
      }
    }
  } catch (err) {
    console.error("Failed to parse Meta payload:", err);
  }

  return result;
}


// ═════════════════════════════════════════════════════════════
// FILE 2 — lib/whatsapp.ts  [FULL REWRITE]
// ═════════════════════════════════════════════════════════════

// Meta Graph API — send messages via the WhatsApp Cloud API.
// All messages go through: POST /v20.0/{PHONE_NUMBER_ID}/messages
// Auth: Bearer token (META_ACCESS_TOKEN)

const META_BASE = `https://graph.facebook.com/${process.env.META_API_VERSION || "v20.0"}`;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID!;

export const WhatsAppService = {

  // ── Send a plain text message to a customer ──────────────
  async sendToCustomer(phone: string, text: string): Promise<void> {
    // Meta has a 4096 character limit per message.
    // Split into chunks if needed (rare for Whats AI responses).
    const chunks = splitMessage(text, 4096);

    for (const chunk of chunks) {
      await this._sendTextMessage(phone, chunk);
    }
  },

  // ── Send a WhatsApp message to the business owner ────────
  async sendToOwner(whatsappNumber: string, payload: { type: string; [key: string]: any }): Promise<void> {
    const text = this.buildOwnerMessage(payload);
    await this.sendToCustomer(whatsappNumber, text);
  },

  // ── Core Graph API call ───────────────────────────────────
  async _sendTextMessage(to: string, text: string): Promise<any> {
    const res = await fetch(`${META_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.META_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          body: text,
          preview_url: false,  // disable link previews for cleaner chat UI
        },
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`WhatsApp send failed (${res.status}): ${error}`);
    }

    return res.json();
  },

  // ── Resolve a Meta media ID to a downloadable URL ────────
  // Meta doesn't give direct URLs for media — you get an ID.
  // Call the Graph API to get the URL, then download with Bearer auth.
  async resolveMediaUrl(mediaId: string): Promise<string> {
    const res = await fetch(`${META_BASE}/${mediaId}`, {
      headers: { "Authorization": `Bearer ${process.env.META_ACCESS_TOKEN}` },
    });

    if (!res.ok) throw new Error(`Media URL resolution failed: ${await res.text()}`);

    const data = await res.json();
    // data.url is a temporary signed URL (valid for ~5 minutes)
    return data.url;
  },

  // ── Download media from Meta (requires Bearer auth) ──────
  // Used by voice note transcription — you can't download without auth.
  async downloadMedia(mediaId: string): Promise<ArrayBuffer> {
    const url = await this.resolveMediaUrl(mediaId);

    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${process.env.META_ACCESS_TOKEN}` },
    });

    if (!res.ok) throw new Error(`Media download failed: ${await res.text()}`);
    return res.arrayBuffer();
  },

  // ── Mark a message as read (optional but good UX) ────────
  // Shows double blue ticks to the customer.
  async markAsRead(messageId: string): Promise<void> {
    await fetch(`${META_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.META_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    }).catch(() => {});  // fire and forget — failure here is non-critical
  },

  // ── Owner message templates ───────────────────────────────
  buildOwnerMessage(payload: any): string {
    switch (payload.type) {
      case "ESCALATION":
        return `🚨 Customer needs your help\n\n${payload.customerName} has an issue:\n"${payload.customerMessage}"\n\nReply directly: ${payload.customerPhone}`;
      case "NEW_ORDER":
        return `📦 New order!\n\nCustomer: ${payload.customerName}\nProduct: ${payload.productName}\nTotal: KES ${payload.total}\n\nOrder #${payload.orderId}`;
      case "LOW_STOCK":
        return `⚠️ Low stock\n\n${payload.productName} has only ${payload.stockRemaining} unit(s) left.`;
      case "GO_LIVE":
        return `🎉 Your AI is LIVE!\n\nShare this link with customers:\n${payload.whatsappLink}\n\nYou'll get your first daily summary tomorrow at 7 AM.`;
      case "WELCOME":
        return `Hi ${payload.ownerName}! 👋 Welcome to Whats AI.\n\nYour store is being set up. Log in to add your products and connect M-Pesa.\n\nhttps://your-app.vercel.app`;
      default:
        return payload.text || "Message from Whats AI.";
    }
  },
};

// Split long messages into chunks at word boundaries
function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt === -1) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}


// ═════════════════════════════════════════════════════════════
// FILE 3 — lib/ai/messageProcessor.ts  [VOICE NOTE SECTION UPDATED]
// ═════════════════════════════════════════════════════════════
// Only the voice note handling section changes.
// Everything else (steps 3-11) is identical to the original.
// Replace the full file with this version.

import { db } from "@/db";
import { business, customer, conversation, message as messageTable, product } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { AgentRouter } from "./agentRouter";
import { WhatsAppService } from "@/lib/whatsapp";
import { VoiceTranscription } from "./voiceTranscription";
import { ResponseHandler } from "./responseHandler";

// Updated interface — mediaId replaces the old mediaUrl for Meta
interface IncomingMessage {
  from: string;
  to: string;
  text: string;
  messageType: "TEXT" | "IMAGE" | "VOICE";
  mediaId: string | null;   // Meta media ID (needs resolution before use)
  mediaUrl: string | null;  // kept for schema compatibility when saving to DB
  timestamp: string;
}

export const MessageProcessor = {

  async handle(msg: IncomingMessage) {
    const { from, to } = msg;
    let { text } = msg;

    // ── 1. Find the business by WhatsApp number ────────────────
    // msg.to = display_phone_number from Meta metadata
    // This maps directly to business.whatsappNumber — no schema change needed.
    const biz = await db.query.business.findFirst({
      where: eq(business.whatsappNumber, to),
      with: {
        products: { where: eq(product.isActive, true), with: { variants: true } },
        sectors: true,
      },
    });

    if (!biz || !biz.aiEnabled) return;

    // ── 2. Transcribe voice notes ──────────────────────────────
    // CHANGED FOR META: media comes as an ID, not a URL.
    // We call WhatsAppService.downloadMedia() which:
    //   (a) calls the Graph API to resolve the ID to a signed URL
    //   (b) downloads the audio bytes with Bearer auth
    // Then we pass the bytes to the STT provider.
    if (msg.messageType === "VOICE" && msg.mediaId) {
      try {
        const audioBuffer = await WhatsAppService.downloadMedia(msg.mediaId);
        const transcript = await VoiceTranscription.transcribeBuffer(audioBuffer);
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
      await db.insert(messageTable).values({
        conversationId: conv.id,
        sender: "CUSTOMER",
        messageType: msg.messageType,
        content: text,
        mediaUrl: msg.mediaId ? `meta-media:${msg.mediaId}` : null,
        // Store the media ID as a reference — prefixed to distinguish from a real URL
      });
      return;
    }

    // ── 6. Save incoming message ─────────────────────────────────
    await db.insert(messageTable).values({
      conversationId: conv.id,
      sender: "CUSTOMER",
      messageType: msg.messageType,
      content: text,
      mediaUrl: msg.mediaId ? `meta-media:${msg.mediaId}` : null,
    });

    // ── 7. Device Empathy — one-time storage tip ─────────────────
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

    if (agentResponse.skipResponse) return;

    // ── 10. Parse action tags, save + send response ──────────────
    const { cleanResponse, actions } = ResponseHandler.parseActions(agentResponse.text || "");
    const finalText = cleanResponse + device_tip;

    await db.insert(messageTable).values({
      conversationId: conv.id,
      sender: "AI",
      messageType: "TEXT",
      content: finalText,
      mediaUrl: null,
    });

    await db.update(conversation)
      .set({ agentType: agentResponse.agentUsed })
      .where(eq(conversation.id, conv.id));

    await WhatsAppService.sendToCustomer(from, finalText);

    // ── 11. Execute side effects (STK push, escalation, etc.) ────
    await ResponseHandler.executeActions(actions, {
      business: biz, customer: cust, conversation: conv, currentMessage: text,
    });
  },
};


// ═════════════════════════════════════════════════════════════
// FILE 4 — lib/ai/voiceTranscription.ts  [ADD transcribeBuffer]
// ═════════════════════════════════════════════════════════════
// The original transcribe(mediaUrl) still works for future use,
// but Meta needs transcribeBuffer(audioBuffer) since we download
// the bytes ourselves with Bearer auth.

export const VoiceTranscription = {

  // Original method — kept for compatibility
  async transcribe(mediaUrl: string): Promise<string | null> {
    const res = await fetch(mediaUrl);
    const buffer = await res.arrayBuffer();
    return this.transcribeBuffer(buffer);
  },

  // New method for Meta — accepts already-downloaded audio bytes
  async transcribeBuffer(audioBuffer: ArrayBuffer): Promise<string | null> {
    const form = new FormData();
    form.append("file", new Blob([audioBuffer]), "voice.ogg");
    form.append("model", "whisper-large-v3");

    const res = await fetch(process.env.STT_API_URL!, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STT_API_KEY}` },
      body: form,
    });

    if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);

    const data = await res.json();
    return data.text?.trim() || null;
  },
};


// ═════════════════════════════════════════════════════════════
// TESTING YOUR META WEBHOOK LOCALLY WITH NGROK
// ═════════════════════════════════════════════════════════════

/*
Step 1 — Start your dev server
  npm run dev

Step 2 — Expose it publicly
  npx ngrok http 3000
  → Copy the https URL: e.g. https://abc123.ngrok-free.app

Step 3 — In Meta Developer Dashboard
  → App → WhatsApp → Configuration → Webhook → Edit
  Callback URL: https://abc123.ngrok-free.app/api/webhook/whatsapp
  Verify token:  (your META_WEBHOOK_VERIFY_TOKEN value)
  → Click "Verify and save" — this triggers the GET request

Step 4 — Subscribe to message events
  → Webhook fields → tick "messages" → Save

Step 5 — Send a test message
  → Use a real phone number that is registered as a Test Recipient
  in the Meta dashboard (under WhatsApp → API Setup → "To" field)
  → Send a message from that phone to your Meta WhatsApp test number

Step 6 — Check your terminal
  You should see the parsed message logged and the AI reply sent back.

IMPORTANT: META_APP_SECRET can be left unset in local dev —
the signature check falls through with a warning. Set it in production.
*/


// ═════════════════════════════════════════════════════════════
// DIFFERENCES SUMMARY — AT vs Meta
// ═════════════════════════════════════════════════════════════

/*
┌─────────────────────────────┬──────────────────────────┬─────────────────────────────────┐
│ Concern                     │ Africa's Talking (old)   │ Meta Cloud API (new)             │
├─────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
│ Webhook verification        │ Simple API key header    │ GET challenge + HMAC-SHA256 POST │
│ Payload structure           │ Flat / shallow           │ Deeply nested entry→changes→...  │
│ Voice note media            │ Direct URL in payload    │ Media ID → resolve via Graph API │
│ Send text message           │ AT REST API              │ Graph API /{phone_number_id}/msg │
│ Auth for sending            │ apiKey header            │ Bearer access token              │
│ Mark as read                │ N/A                      │ Optional — POST status: "read"   │
│ Business identification     │ msg.to = phone number    │ metadata.display_phone_number    │
│ Files that changed          │ —                        │ route.ts, whatsapp.ts,           │
│                             │                          │ messageProcessor.ts (voice only),│
│                             │                          │ voiceTranscription.ts (+1 method)│
│ Files unchanged             │ —                        │ Everything else (agents, M-Pesa, │
│                             │                          │ Redis, schema, agentRouter, etc) │
└─────────────────────────────┴──────────────────────────┴─────────────────────────────────┘
*/
