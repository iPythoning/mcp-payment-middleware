# How to Add Payment to Your MCP Server in 5 Minutes

**14,000+ MCP servers exist. Fewer than 5% are monetized. Here's a free, 1-line way to fix that.**

---

You built something useful. An MCP server that lets Claude search your database, generate reports, or access your API. People are using it. You're thinking: *"maybe I should charge for this?"*

Then you look at what it takes:

- Set up Stripe Checkout
- Handle webhooks
- Track usage per user
- Rate limit
- Or even worse — figure out x402 protocol for agent-to-agent payments

Suddenly "charge for it" becomes a weekend project you don't have time for.

**I built a free middleware that makes it one line.**

```bash
npm install mcp-payment-middleware
```

## The One-Line Integration

If you already have an MCP server:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withPayment } from "mcp-payment-middleware";

const base = new McpServer({ name: "my-server", version: "1.0.0" });

// One line. That's it.
const server = withPayment(base, {
  price: 0.001, // USDC per call — about $0.001
  paymentMethods: ["usdc"],
  walletAddress: "0x6024AB6263AB33150C4Ab83E74733AD42fdD71C4",
  freeTierCalls: 5,
});

// Register tools as normal — payment is automatic
server.tool("premium-tool", schema, handler);
await server.connect(new StdioServerTransport());
```

That's it. Your MCP server now:

1. Allows 5 free calls per user
2. Requires USDC payment for calls beyond that
3. Rate-limits to prevent abuse
4. Tracks usage per user

## What's Happening Under the Hood

Every tool call goes through this flow:

```
User calls tool
  → Check rate limit (too many? deny)
  → Free tier remaining? (yes → allow, decrement)
  → Valid license key? (yes → allow)
  → Verified payment? (yes → allow)
  → Deny with payment link
```

The middleware injects a `_meta` parameter into every tool's schema — users pass their license key or payment proof there.

## Why USDC First (No API Keys Required)

I made a deliberate choice: **USDC verification uses public RPC endpoints.** No API keys. No third-party signup. The middleware just checks `eth_getLogs` on Arbitrum, Base, or Polygon.

```ts
// Under the hood — 60 lines of ethers.js + public RPC
const filter = {
  address: USDC_CONTRACT,
  topics: [TRANSFER_EVENT, null, padAddress(walletAddress)],
  fromBlock: block.number - 50_000,
};
const logs = await provider.getLogs(filter);
// Match amount, block confirmations, unique transaction
```

This means you can add payment to your MCP server without signing up for anything. Your users pay in USDC (crypto), and the middleware verifies it on-chain.

**But if you prefer Stripe**, that's supported too:

```ts
const server = withPayment(base, {
  price: 2.99,
  paymentMethods: ["stripe"],
  stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
});
```

## License Keys (No Payment Provider Needed)

Sometimes you just want to give someone a key:

```ts
import { generateLicenseKey, createLicenseKey } from "mcp-payment-middleware";

// Simple: just generate a key
const key = generateLicenseKey();
// → "mcp-ABCD-EFGH-JKLM"

// Advanced: signed key with embedded metadata (tamper-proof)
const signed = createLicenseKey({
  secret: "my-256-bit-secret",
  maxCalls: 1000,
  expiresAt: new Date("2026-12-31"),
});
// → "mcp-XXXX-YYYY-ZZZZ.signed_hmac"
```

On the server, just call `server.addLicenseKey(signed)` and the middleware handles validation automatically.

## Rate Limiting Built In

```ts
const server = new PaymentMcpServer({
  name: "my-server",
  version: "1.0.0",
  payment: {
    price: 0.001,
    paymentMethods: ["usdc"],
    walletAddress: "0x...",
    rateLimit: {
      maxCalls: 100,         // 100 calls
      windowSeconds: 3600,   // per hour
    },
  },
});
```

Too many calls? The middleware returns a structured error with the retry-after time.

## Why I Built This

Here's the market reality:

- **14,000+ MCP servers** exist across GitHub and npm
- **<5% are monetized** — most are free, ad-supported, or abandoned
- **176M+ agent-to-agent payments** have already flowed through x402 ($73M volume)
- **0 MCP payment middlewares** existed before this one

The payment rails exist. The demand is real. But the integration friction is too high for a solo developer shipping a side project.

This middleware is **free, MIT-licensed, and always will be.** The goal is to make MCP monetization so easy that it becomes the default, not the exception.

## What's Next

The roadmap:

- [x] Core middleware (`withPayment`, `PaymentMcpServer`)
- [x] USDC payment verification (Arbitrum, Base, Polygon)
- [x] Stripe payment verification
- [x] License keys (generation + validation)
- [x] Rate limiting + usage tracking
- [ ] Stripe Checkout Session creation
- [ ] Persistent storage adapters (D1, KV, Postgres)
- [ ] Usage dashboard (self-hosted)
- [ ] x402 protocol support

## Try It

```bash
npm install mcp-payment-middleware
```

GitHub: [github.com/iPythoning/mcp-payment-middleware](https://github.com/iPythoning/mcp-payment-middleware)

I'd love feedback — what's blocking you from monetizing your MCP server? Drop an issue or comment below.

---

*Built in public. MIT License. No strings attached.*
