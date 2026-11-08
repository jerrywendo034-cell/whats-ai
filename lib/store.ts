import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type {
  Business,
  ChatMessage,
  Conversation,
  Customer,
  Negotiation,
  Order,
  Payment,
  Product,
  StoreSnapshot,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

const DEMO_BUSINESS_ID = "biz-demo";
const DEMO_PRODUCTS: Product[] = [
  {
    id: "prod-hoodie",
    businessId: DEMO_BUSINESS_ID,
    name: "Kilimani Hoodie",
    description: "Heavy cotton hoodie, unisex, sizes S–XL.",
    category: "Apparel",
    price: 2500,
    minimumPrice: 2000,
    stock: 18,
    negotiationEnabled: true,
    isActive: true,
  },
  {
    id: "prod-tee",
    businessId: DEMO_BUSINESS_ID,
    name: "Plain Tee",
    description: "Soft cotton T-shirt in black, white, or olive.",
    category: "Apparel",
    price: 1200,
    minimumPrice: 1000,
    stock: 40,
    negotiationEnabled: true,
    isActive: true,
  },
  {
    id: "prod-cap",
    businessId: DEMO_BUSINESS_ID,
    name: "Logo Cap",
    description: "Embroidered cap, one size.",
    category: "Accessories",
    price: 800,
    minimumPrice: 700,
    stock: 25,
    negotiationEnabled: true,
    isActive: true,
  },
  {
    id: "prod-dress",
    businessId: DEMO_BUSINESS_ID,
    name: "Ankara Dress",
    description: "Tailored Ankara dress. Fixed price.",
    category: "Apparel",
    price: 4500,
    minimumPrice: 4500,
    stock: 6,
    negotiationEnabled: false,
    isActive: true,
  },
];

function seed(): StoreSnapshot {
  const whatsappNumber = process.env.DEMO_BUSINESS_WHATSAPP || "254700000000";
  const business: Business = {
    id: DEMO_BUSINESS_ID,
    businessName: "Kilimani Threads",
    ownerName: "Demo Owner",
    phone: "254712345678",
    whatsappNumber,
    mpesaTill: "123456",
    aiEnabled: true,
    negotiationEnabled: true,
    maxNegotiationRounds: 5,
  };
  return {
    business,
    products: DEMO_PRODUCTS,
    customers: [],
    conversations: [],
    messages: [],
    negotiations: [],
    orders: [],
    payments: [],
  };
}

function load(): StoreSnapshot {
  try {
    if (existsSync(DATA_FILE)) {
      return JSON.parse(readFileSync(DATA_FILE, "utf8")) as StoreSnapshot;
    }
  } catch {
    // Fall back to a fresh demo store.
  }
  return seed();
}

function save(data: StoreSnapshot) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

const globalStore = globalThis as typeof globalThis & {
  __whatsaiStore?: StoreSnapshot;
};

function data() {
  if (!globalStore.__whatsaiStore) {
    globalStore.__whatsaiStore = load();
  }
  return globalStore.__whatsaiStore;
}

function persist() {
  save(data());
}

export const store = {
  snapshot(): StoreSnapshot {
    return data();
  },

  business(): Business {
    return data().business;
  },

  updateBusiness(patch: Partial<Business>) {
    Object.assign(data().business, patch);
    persist();
    return data().business;
  },

  products() {
    return data().products.filter((p) => p.isActive);
  },

  addProduct(input: Omit<Product, "id" | "businessId" | "isActive">) {
    const product: Product = {
      ...input,
      id: crypto.randomUUID(),
      businessId: data().business.id,
      isActive: true,
    };
    data().products.push(product);
    persist();
    return product;
  },

  findProduct(id: string) {
    return data().products.find((p) => p.id === id);
  },

  findOrCreateCustomer(phone: string, name?: string | null) {
    const d = data();
    let customer = d.customers.find((c) => c.phone === phone);
    if (!customer) {
      customer = {
        id: crypto.randomUUID(),
        businessId: d.business.id,
        name: name || null,
        phone,
      };
      d.customers.push(customer);
      persist();
    } else if (name && !customer.name) {
      customer.name = name;
      persist();
    }
    return customer;
  },

  findCustomer(id: string) {
    return data().customers.find((c) => c.id === id);
  },

  getOrCreateConversation(customerId: string) {
    const d = data();
    let conversation = d.conversations.find(
      (c) => c.customerId === customerId && c.status === "ACTIVE",
    );
    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(),
        businessId: d.business.id,
        customerId,
        status: "ACTIVE",
        agentType: null,
        humanTakeover: false,
        startedAt: new Date().toISOString(),
      };
      d.conversations.push(conversation);
      persist();
    }
    return conversation;
  },

  conversations() {
    return [...data().conversations].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  },

  findConversation(id: string) {
    return data().conversations.find((c) => c.id === id);
  },

  setConversation(id: string, patch: Partial<Conversation>) {
    const conversation = data().conversations.find((c) => c.id === id);
    if (!conversation) return null;
    Object.assign(conversation, patch);
    persist();
    return conversation;
  },

  addMessage(input: Omit<ChatMessage, "id" | "createdAt">) {
    const message: ChatMessage = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data().messages.push(message);
    persist();
    return message;
  },

  messages(conversationId: string) {
    return data().messages.filter((m) => m.conversationId === conversationId);
  },

  activeNegotiation(customerId: string, productId?: string) {
    return data().negotiations.find(
      (n) =>
        n.customerId === customerId &&
        n.status === "ACTIVE" &&
        (!productId || n.productId === productId),
    );
  },

 latestNegotiation(customerId: string, productId?: string) {
  return [...data().negotiations]
    .reverse()
    .find(
      (n) =>
        n.customerId === customerId &&
        n.productId === productId &&
        n.status === "ACCEPTED",
    );
},

  upsertNegotiation(negotiation: Negotiation) {
    const d = data();
    const index = d.negotiations.findIndex((n) => n.id === negotiation.id);
    if (index >= 0) d.negotiations[index] = negotiation;
    else d.negotiations.push(negotiation);
    persist();
    return negotiation;
  },

  orders() {
    return [...data().orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  customerOrders(customerId: string) {
    return data().orders.filter((o) => o.customerId === customerId);
  },

  addOrder(input: Omit<Order, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const order: Order = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    data().orders.push(order);
    persist();
    return order;
  },

  updateOrder(id: string, patch: Partial<Order>) {
    const order = data().orders.find((o) => o.id === id);
    if (!order) return null;
    Object.assign(order, patch, { updatedAt: new Date().toISOString() });
    persist();
    return order;
  },

  addPayment(input: Omit<Payment, "id" | "createdAt">) {
    const payment: Payment = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data().payments.push(payment);
    persist();
    return payment;
  },

  markPaymentSuccess(orderId: string, receipt: string) {
    const payment = data().payments.find((p) => p.orderId === orderId);
    if (payment) {
      payment.status = "SUCCESS";
      payment.mpesaReceipt = receipt;
    }
    persist();
    return payment;
  },

  summary() {
    const d = data();
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = d.orders.filter((o) => o.createdAt.startsWith(today));
    const paid = d.orders.filter((o) =>
      ["PAID", "PACKED", "DISPATCHED", "DELIVERED"].includes(o.status),
    );
    return {
      todayOrders: todayOrders.length,
      todayRevenue: todayOrders
        .filter((o) => o.status !== "CANCELLED")
        .reduce((sum, o) => sum + o.total, 0),
      activeChats: d.conversations.filter((c) => c.status === "ACTIVE").length,
      totalOrders: d.orders.length,
      paidRevenue: paid.reduce((sum, o) => sum + o.total, 0),
    };
  },
};
