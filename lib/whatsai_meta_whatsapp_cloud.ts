import { digitsPhone } from "./format";

type MetaTextMessage = {
  from: string;
  id?: string;
  type?: string;
  text?: { body?: string };
};

type MetaChange = {
  value?: {
    metadata?: { display_phone_number?: string; phone_number_id?: string };
    contacts?: { profile?: { name?: string }; wa_id?: string }[];
    messages?: MetaTextMessage[];
  };
};

export type InboundMessage = {
  from: string;
  to: string;
  text: string;
  name?: string;
  messageId?: string;
};

export function parseInbound(body: unknown): InboundMessage[] {
  if (!body || typeof body !== "object") return [];
  const payload = body as Record<string, unknown>;

  if (typeof payload.from === "string" && (payload.text || payload.message)) {
    return [
      {
        from: digitsPhone(payload.from),
        to: digitsPhone(String(payload.to || process.env.DEMO_BUSINESS_WHATSAPP || "254700000000")),
        text: String(payload.text || payload.message || ""),
        name: payload.name ? String(payload.name) : undefined,
      },
    ];
  }

  const entry = payload.entry as { changes?: MetaChange[] }[] | undefined;
  const messages: InboundMessage[] = [];
  for (const item of entry || []) {
    for (const change of item.changes || []) {
      const value = change.value;
      const to = digitsPhone(
        value?.metadata?.display_phone_number ||
          process.env.DEMO_BUSINESS_WHATSAPP ||
          "254700000000",
      );
      const name = value?.contacts?.[0]?.profile?.name;
      for (const message of value?.messages || []) {
        messages.push({
          from: digitsPhone(message.from),
          to,
          text: message.text?.body || "",
          name,
          messageId: message.id,
        });
      }
    }
  }
  return messages;
}

export async function sendWhatsAppText(to: string, text: string) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.log("[WhatsApp outbound skipped — missing Meta credentials]", { to, text });
    return { skipped: true };
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("WhatsApp send failed", error);
    return { skipped: false, ok: false, error };
  }
  return { skipped: false, ok: true };
}
