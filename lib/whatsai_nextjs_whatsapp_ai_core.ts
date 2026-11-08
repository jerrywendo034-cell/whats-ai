import { kes } from "./format";
import { store } from "./store";
import {
  bargain,
  completeDemoPayment,
  startDemoStk,
} from "./whatsai_nextjs_bargaining_mpesa";
import type { AgentType, Product } from "./types";

function classify(text: string): AgentType {
  const t = text.toLowerCase();
  if (/(too expensive|discount|best price|negotiate|come down|offer|haggle)/.test(t)) {
    return "NEGOTIATION";
  }
  if (/(where is|order status|tracking|delivered|packed|dispatch|receipt)/.test(t)) {
    return "SUPPORT";
  }
  if (/(pay|stk|mpesa|m-pesa|i'll take|i will take|buy now|checkout)/.test(t)) {
    return "PAYMENT";
  }
  if (/(takeover|human|agent please|talk to owner)/.test(t)) {
    return "STORE_MANAGER";
  }
  return "SALES";
}

function catalogText(products: Product[]) {
  if (!products.length) return "No products listed yet.";
  return products
    .map((p) => {
      const bargainNote = p.negotiationEnabled ? " · bargaining on" : " · fixed price";
      return `• ${p.name} — ${kes(p.price)}${bargainNote}`;
    })
    .join("\n");
}

export function matchProduct(text: string) {
  const t = text.toLowerCase();
  const products = store.products();
  return (
    products.find((p) => t.includes(p.name.toLowerCase())) ||
    products.find((p) =>
      p.name
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.length > 3 && t.includes(word)),
    )
  );
}

function lastMentionedProduct(customerId: string) {
  const conversation = store
    .conversations()
    .find((c) => c.customerId === customerId && c.status === "ACTIVE");

  if (conversation) {
    const messages = store.messages(conversation.id);

    for (const message of [...messages].reverse()) {
      const product = matchProduct(message.content);
      if (product) return product;
    }
  }

  const negotiation = store.activeNegotiation(customerId);
  if (negotiation) return store.findProduct(negotiation.productId);

  const orders = store.customerOrders(customerId);
  if (orders[0]) return store.findProduct(orders[0].productId);

  return undefined;
}

function placeOrder(customerId: string, product: Product, unitPrice: number) {
  if (product.stock <= 0) {
    return { order: null, reply: `${product.name} is out of stock right now.` };
  }
  const order = store.addOrder({
    businessId: store.business().id,
    customerId,
    productId: product.id,
    quantity: 1,
    unitPrice,
    total: unitPrice,
    status: "PENDING",
    notes: null,
  });
  const checkoutRequestId = startDemoStk(order.id, store.findCustomer(customerId)?.phone || "", unitPrice);
  return {
    order,
    reply: `Order placed for ${product.name} at ${kes(unitPrice)}.\nM-Pesa STK (demo) sent. Checkout ID: ${checkoutRequestId}.\nReply "paid" after you complete the prompt, or wait — Whats AI tracks the order, the shop or a courier handles delivery.`,
  };
}

export function generateReply(customerId: string, text: string) {
  const business = store.business();
  const products = store.products();
  const agentType = classify(text);
  const product = matchProduct(text) || lastMentionedProduct(customerId);
  const t = text.toLowerCase();

  if (!business.aiEnabled) {
    return {
      agentType: "STORE_MANAGER" as const,
      reply: `Thanks for messaging ${business.businessName}. The AI assistant is paused — a person from the shop will reply shortly.`,
    };
  }

  if (agentType === "STORE_MANAGER") {
    return {
      agentType,
      reply: `I can connect you to the shop owner. Meanwhile here is the catalog:\n\n${catalogText(products)}`,
    };
  }

  if (agentType === "SUPPORT") {
    const orders = store.customerOrders(customerId);
    if (!orders.length) {
      return {
        agentType,
        reply: `I do not see an order on this number yet. Tell me the product you want, or send an M-Pesa receipt if you already paid.`,
      };
    }
    const lines = orders.map((o) => {
      const item = store.findProduct(o.productId);
      return `• ${item?.name || "Item"} — ${kes(o.total)} — ${o.status}`;
    });
    return {
      agentType,
      reply: `Here is your order progress (Whats AI tracks status; delivery is by the shop or their courier):\n\n${lines.join("\n")}\n\nIf something moved, the merchant updates this from the dashboard.`,
    };
  }

  if (/(paid|nimetuma|done paying)/.test(t)) {
   const pending = [...store.customerOrders(customerId)]
  .reverse()
  .find((o) => o.status === "PENDING");
    if (!pending) {
      return { agentType: "PAYMENT" as const, reply: "I do not have a pending payment on this chat." };
    }
    const receipt = completeDemoPayment(pending.id);
    return {
      agentType: "PAYMENT" as const,
      reply: `Payment confirmed (demo). Receipt ${receipt}. Status is now PAID. The shop will pack and then update DISPATCHED / DELIVERED. I will keep you posted.`,
    };
  }

  if (agentType === "PAYMENT" || /(i'll take|i will take|deal|ok take it)/.test(t)) {
    if (!product) {
      return {
        agentType: "PAYMENT" as const,
        reply: `Which product should I charge? Catalog:\n\n${catalogText(products)}`,
      };
    }
    const negotiation =
  store.latestNegotiation(customerId, product.id);
    const price = negotiation?.agreedPrice ?? negotiation?.currentAsk ?? product.price;
    const placed = placeOrder(customerId, product, price);
    return { agentType: "PAYMENT" as const, reply: placed.reply };
  }

  if (agentType === "NEGOTIATION" || extractLooksLikeOffer(t, product)) {
    if (!product) {
      return {
        agentType: "NEGOTIATION" as const,
        reply: `I can bargain on selected items, up to 5 rounds, without going below the shop minimum. Which product?\n\n${catalogText(products)}`,
      };
    }
    const result = bargain(product, customerId, text);
    return { agentType: "NEGOTIATION" as const, reply: result.reply };
  }

if (product) {
  return {
    agentType: "SALES" as const,
    reply: `${product.name}: ${product.description}\nPrice ${kes(product.price)}${product.negotiationEnabled ? ` (bargaining allowed, floor protected, max 5 rounds)` : " (fixed price)"}.\nStock ${product.stock}.\n${product.negotiationEnabled ? `Say "I'll take it" to order, or send an offer if you want to bargain.` : `This item has a fixed price. Say "I'll take it" to order.`}`,
  };
}

return {
  agentType: "SALES" as const,
  reply: `Hi — I am the Whats AI sales assistant for ${business.businessName}. I sell, bargain (up to 5 rounds), take M-Pesa, and track orders. I do not deliver packages myself.\n\n${catalogText(products)}\n\nWhat are you looking for?`,
};
}

function extractLooksLikeOffer(text: string, product: Product | undefined) {
  return Boolean(product && /\d{2,7}/.test(text.replace(/,/g, "")));
}

export function handleInboundText(from: string, text: string, profileName?: string) {
  const customer = store.findOrCreateCustomer(from, profileName);
  const conversation = store.getOrCreateConversation(customer.id);

  store.addMessage({
    conversationId: conversation.id,
    sender: "CUSTOMER",
    content: text || "[media]",
  });

  if (conversation.humanTakeover) {
    store.setConversation(conversation.id, { agentType: "STORE_MANAGER" });
    const reply =
      "A person from the shop has taken this chat. They will reply here shortly.";
    store.addMessage({
      conversationId: conversation.id,
      sender: "SYSTEM",
      content: reply,
    });
    return { conversationId: conversation.id, reply, agentType: "STORE_MANAGER" as const };
  }

  const result = generateReply(customer.id, text);
  store.setConversation(conversation.id, { agentType: result.agentType });
  store.addMessage({
    conversationId: conversation.id,
    sender: "AI",
    content: result.reply,
  });
  return { conversationId: conversation.id, ...result };
}
