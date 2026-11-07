export type AgentType =
  | "SALES"
  | "NEGOTIATION"
  | "SUPPORT"
  | "PAYMENT"
  | "FOLLOW_UP"
  | "STORE_MANAGER";

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PACKED"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "TIMEOUT"
  | "REFUNDED";

export type NegotiationStatus = "ACTIVE" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export type ConversationStatus = "ACTIVE" | "RESOLVED" | "ESCALATED";

export type MessageSender = "CUSTOMER" | "AI" | "OWNER" | "SYSTEM";

export type Business = {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  whatsappNumber: string;
  mpesaTill: string;
  aiEnabled: boolean;
  negotiationEnabled: boolean;
  maxNegotiationRounds: number;
};

export type Product = {
  id: string;
  businessId: string;
  name: string;
  description: string;
  category: string;
  price: number;
  minimumPrice: number;
  stock: number;
  negotiationEnabled: boolean;
  isActive: boolean;
};

export type Customer = {
  id: string;
  businessId: string;
  name: string | null;
  phone: string;
};

export type Conversation = {
  id: string;
  businessId: string;
  customerId: string;
  status: ConversationStatus;
  agentType: AgentType | null;
  humanTakeover: boolean;
  startedAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  sender: MessageSender;
  content: string;
  createdAt: string;
};

export type Negotiation = {
  id: string;
  businessId: string;
  customerId: string;
  productId: string;
  startingPrice: number;
  currentAsk: number;
  lastOffer: number | null;
  minimumPrice: number;
  agreedPrice: number | null;
  roundsUsed: number;
  maxRounds: number;
  status: NegotiationStatus;
};

export type Order = {
  id: string;
  businessId: string;
  customerId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Payment = {
  id: string;
  orderId: string;
  phone: string;
  amount: number;
  status: PaymentStatus;
  checkoutRequestId: string | null;
  mpesaReceipt: string | null;
  createdAt: string;
};

export type StoreSnapshot = {
  business: Business;
  products: Product[];
  customers: Customer[];
  conversations: Conversation[];
  messages: ChatMessage[];
  negotiations: Negotiation[];
  orders: Order[];
  payments: Payment[];
};
