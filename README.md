# Whats AI

> An AI-powered WhatsApp business assistant that helps businesses communicate with customers, manage products and orders, support payments, and provide faster customer service.

## 🚀 Overview

Whats AI is a WhatsApp-based AI assistant designed for small and growing businesses.

Instead of requiring a business owner to manually respond to every customer message, Whats AI helps automate common customer interactions such as product enquiries, sales conversations, price negotiations, order management, payment support, and order-status updates.

Whats AI is **not a delivery company**. Businesses remain responsible for their suppliers and delivery partners. Whats AI communicates with customers and provides order-status information.

## ✨ Key Features

- 💬 AI-powered customer conversations
- 🛍️ Product and catalog management
- 📦 Order management
- 💰 M-Pesa payment support
- 🤝 Customer price negotiation
- 📊 Merchant dashboard
- 📥 Customer conversation inbox
- 👤 Human takeover for customer conversations
- 🔄 Order-status communication
- 🌍 WhatsApp-based customer experience
- 🧪 WhatsApp-style customer simulator
- 🛡️ Environment-variable based configuration for sensitive credentials

## 🧠 How It Works

```text
Customer
   ↓
WhatsApp
   ↓
Whats AI
   ↓
AI Conversation Processing
   ↓
Sales / Negotiation / Support / Payment
   ↓
Order Management
   ↓
Customer Response
```

### Example Conversation

```text
Customer: Hi, do you have hoodies?

Whats AI: Yes, we have hoodies available. What size are you looking for?

Customer: It's too expensive. Can you do 1,800?

Whats AI: I can help with that. Let me check the available price range.

Customer: I'll take it.

Whats AI: Great. Let's proceed with your order.
```

## 🛠️ Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- Next.js API Routes
- Node.js
- Drizzle ORM

### Integrations

- WhatsApp Cloud API
- M-Pesa / Safaricom Daraja
- AI services

### Development Tools

- Git
- GitHub
- VS Code
- Cursor

## 📁 Project Structure

```text
whats-ai/
├── app/
│   ├── api/
│   │   ├── dashboard/
│   │   ├── simulate/
│   │   └── webhook/
│   ├── dashboard/
│   ├── simulate/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   └── Sidebar.tsx
│
├── db/
│   ├── index.ts
│   └── whatsai_drizzle_schema.ts
│
├── lib/
│   ├── client.ts
│   ├── format.ts
│   ├── store.ts
│   └── types.ts
│
├── public/
├── docs/
├── .env.example
├── drizzle.config.ts
├── package.json
└── README.md
```

## 🖥️ Local Demo

The project includes a local demo environment that can be used without connecting a production WhatsApp account.

Available pages:

| Page         | Description                      |
| ------------ | -------------------------------- |
| `/`          | Whats AI landing page            |
| `/simulate`  | Customer conversation simulator  |
| `/dashboard` | Merchant dashboard               |

The simulator allows you to test conversations such as:

```text
Hi
↓
hoodie
↓
too expensive 1800
↓
I'll take it
↓
paid
↓
where is my order?
```

## ⚙️ Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/jerrywendo034-cell/whats-ai.git
```

### 2. Enter the project

```bash
cd whats-ai
```

### 3. Install dependencies

```bash
npm install
```

### 4. Create your environment file

Windows:

```bash
copy .env.example .env.local
```

macOS/Linux:

```bash
cp .env.example .env.local
```

### 5. Configure environment variables

Add your development credentials to `.env.local`.

> Never commit `.env.local` or real API keys to GitHub.

### 6. Start the development server

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## 🔐 Security

Sensitive credentials are stored through environment variables.

The repository intentionally ignores files such as:

```text
.env.local
.env
.env.production
```

Only `.env.example` is included as a reference for required environment variables.

## 📱 WhatsApp Integration

Whats AI includes a WhatsApp webhook endpoint:

```text
/api/webhook/whatsapp
```

The endpoint is designed to handle WhatsApp Cloud API webhook requests and process incoming customer messages.

For production use, WhatsApp credentials such as the access token and phone number ID must be configured through environment variables.

## 💳 M-Pesa Integration

The project is designed to support M-Pesa payment workflows.

The payment flow can be used to connect customer orders with payment processing and order-status updates.

Production payment processing requires the appropriate Safaricom Daraja credentials and configuration.

## 🤝 Business Model

Whats AI is designed as a business software product.

```text
Business
   ↓
Pays for Whats AI
   ↓
Whats AI communicates with customers
   ↓
Customers receive faster support
```

The business remains responsible for:

- Product supply
- Inventory
- Delivery
- Courier relationships
- Fulfilment

Whats AI focuses on communication, automation, customer support, orders, and payment-related workflows.

## 🗺️ Roadmap

Future development may include:

- [ ] Production PostgreSQL deployment
- [ ] Improved authentication
- [ ] Production Safaricom Daraja integration
- [ ] Advanced AI conversation handling
- [ ] Automated customer follow-ups
- [ ] Analytics and business insights
- [ ] Multi-business onboarding
- [ ] Improved multilingual support
- [ ] Production WhatsApp deployment
- [ ] Subscription and billing system

## 📸 Screenshots

Screenshots and product demonstrations will be added as the project interface continues to develop.

## 📌 Project Status

**Status:** Active development

Whats AI is currently being developed as a practical AI-powered business communication platform.

The project is being built with a focus on:

- AI automation
- Software engineering
- Customer experience
- Business process automation
- WhatsApp integrations
- M-Pesa payment workflows

## 👨‍💻 Developer

**Jerry Wendo**

Computer Science Student
Dedan Kimathi University of Technology

- GitHub: https://github.com/jerrywendo034-cell
- LinkedIn: https://www.linkedin.com/in/jerry-wendo-28424b3a3/

## 📄 License

This project is currently under active development. Licensing information will be added as the project approaches a public production release.