import { kes } from "./format";
import { store } from "./store";
import type { Negotiation, Product } from "./types";

export function extractOffer(text: string) {
  const match = text
    .replace(/,/g, "")
    .match(/(?:kes|ksh|\/=)?\s*(\d{2,7})/i);

  if (!match) return null;

  return Number(match[1]);
}

export function askingPrice(negotiation: Negotiation) {
  const room = Math.max(0, negotiation.startingPrice - negotiation.minimumPrice);
  const drop = (room / negotiation.maxRounds) * negotiation.roundsUsed;
  return Math.max(
    negotiation.minimumPrice,
    Math.round(negotiation.startingPrice - drop),
  );
}

export function bargain(product: Product, customerId: string, text: string) {
  const business = store.business();
  if (!business.negotiationEnabled || !product.negotiationEnabled) {
    return {
      accepted: false,
      reply: `${product.name} is a fixed-price item at ${kes(product.price)}. I can place the order at that price if you say "I'll take it".`,
    };
  }

  let negotiation = store.activeNegotiation(customerId, product.id);
  if (!negotiation) {
    negotiation = {
      id: crypto.randomUUID(),
      businessId: business.id,
      customerId,
      productId: product.id,
      startingPrice: product.price,
      currentAsk: product.price,
      lastOffer: null,
      minimumPrice: product.minimumPrice,
      agreedPrice: null,
      roundsUsed: 0,
      maxRounds: Math.min(business.maxNegotiationRounds, 5),
      status: "ACTIVE",
    };
  }

  const offer = extractOffer(text);
  if (offer == null) {
    store.upsertNegotiation(negotiation);
    return {
      accepted: false,
      reply: `${product.name} is ${kes(product.price)}. Lowest I can work towards is protected by the shop. What number did you have in mind? (Up to ${negotiation.maxRounds} rounds.)`,
    };
  }

  negotiation.lastOffer = offer;
  const ask = askingPrice(negotiation);

  if (offer >= ask) {
    negotiation.status = "ACCEPTED";
    negotiation.agreedPrice = ask;
    negotiation.currentAsk = ask;
    store.upsertNegotiation(negotiation);
    return {
      accepted: true,
      price: ask,
      reply: `Deal. ${product.name} at ${kes(ask)}. Reply "pay" and I will send the M-Pesa prompt to Till ${business.mpesaTill}.`,
    };
  }

 if (negotiation.roundsUsed + 1 >= negotiation.maxRounds) {
  negotiation.roundsUsed = negotiation.maxRounds;
  negotiation.currentAsk = negotiation.minimumPrice;
  store.upsertNegotiation(negotiation);

  if (offer >= negotiation.minimumPrice) {
    negotiation.status = "ACCEPTED";
    negotiation.agreedPrice = negotiation.minimumPrice;
    store.upsertNegotiation(negotiation);

    return {
      accepted: true,
      price: negotiation.minimumPrice,
      reply: `Deal. ${product.name} at ${kes(negotiation.minimumPrice)}. Reply "pay" and I will send the M-Pesa prompt to Till ${business.mpesaTill}.`,
    };
  }

  return {
    accepted: false,
    reply: `Final round ${negotiation.maxRounds}/${negotiation.maxRounds}: the lowest I can do is ${kes(negotiation.minimumPrice)} for ${product.name}. Say "I'll take it" at ${kes(negotiation.minimumPrice)} or pick another item.`,
  };
}

  negotiation.roundsUsed += 1;
  negotiation.currentAsk = askingPrice(negotiation);
  store.upsertNegotiation(negotiation);

  return {
    accepted: false,
    reply: `I hear you on ${kes(offer)}. Round ${negotiation.roundsUsed}/${negotiation.maxRounds}: I can do ${product.name} at ${kes(negotiation.currentAsk)}. Want to close at that, or make another offer?`,
  };
}

export function startDemoStk(orderId: string, phone: string, amount: number) {
  const checkoutRequestId = `ws_stk_${crypto.randomUUID().slice(0, 8)}`;
  store.addPayment({
    orderId,
    phone,
    amount,
    status: "PENDING",
    checkoutRequestId,
    mpesaReceipt: null,
  });
  return checkoutRequestId;
}

export function completeDemoPayment(orderId: string) {
  const receipt = `QK${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")}`;
  store.markPaymentSuccess(orderId, receipt);
  store.updateOrder(orderId, { status: "PAID" });
  return receipt;
}
