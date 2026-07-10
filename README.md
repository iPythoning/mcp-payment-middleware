# MCP Payment Middleware

<!-- bmc:front -->
<p align="center"><a href="https://buymeacoffee.com/dayongfan"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=&amp;slug=dayongfan&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Cookie&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy me a coffee"></a></p>
<!-- /bmc:front -->

> Add paid access to your MCP server in under 10 minutes. Free, open-source, MIT-licensed.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/iPythoning/mcp-payment-middleware?style=social)](https://github.com/iPythoning/mcp-payment-middleware)
[![npm version](https://img.shields.io/npm/v/mcp-payment-middleware)](https://www.npmjs.com/package/mcp-payment-middleware)

```bash
npm install mcp-payment-middleware
```

---

## Quick Start

```ts
import { PaymentMcpServer } from "mcp-payment-middleware";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new PaymentMcpServer({
  name: "my-paid-server",
  version: "1.0.0",
  payment: {
    price: 0.001, // USDC per call
    paymentMethods: ["usdc"],
    walletAddress: "0x6024AB6263AB33150C4Ab83E74733AD42fdD71C4",
    freeTierCalls: 5, // 5 free calls
  },
});

server.tool(
  "expensive-tool",
  { query: z.string() },
  async ({ query }) => ({
    content: [{ type: "text", text: `Result for: ${query}` }],
  }),
);

await server.connect(new StdioServerTransport());
```

### With Stripe

```ts
const server = new PaymentMcpServer({
  name: "my-server",
  version: "1.0.0",
  payment: {
    price: 2.99,
    paymentMethods: ["stripe"],
    stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
  },
});
```

### With an existing McpServer

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withPayment } from "mcp-payment-middleware";

const base = new McpServer({ name: "my-server", version: "1.0.0" });
const server = withPayment(base, {
  price: 0.001,
  paymentMethods: ["usdc"],
  walletAddress: "0x...",
});

// Register tools as normal — they're automatically gated
server.tool("my-tool", schema, handler);
```

---

## Payment Methods

### USDC (on-chain, no API key required)

Verifies payments on Arbitrum, Base, or Polygon using public RPC endpoints. No API keys needed.

```ts
payment: {
  paymentMethods: ["usdc"],
  walletAddress: "0x...",
  usdcChain: "arbitrum", // "arbitrum" | "base" | "polygon"
}
```

### Stripe

Uses Stripe Checkout. Requires a Stripe secret key.

```ts
payment: {
  paymentMethods: ["stripe"],
  stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
}
```

### Custom Providers

Implement the `PaymentProvider` interface:

```ts
import type { PaymentProvider } from "mcp-payment-middleware";

const myProvider: PaymentProvider = {
  name: "my-payment",
  async verifyPayment(userId, amount) {
    // Your verification logic
    return { verified: true, provider: "my-payment" };
  },
};

const server = new PaymentMcpServer({
  name: "my-server",
  version: "1.0.0",
  payment: {
    price: 0.001,
    paymentMethods: [], // No built-in methods
    customProviders: [myProvider],
  },
});
```

---

## License Keys

Generate and validate license keys without a payment provider:

```ts
import { generateLicenseKey, createLicenseKey } from "mcp-payment-middleware";

// Generate a simple key
const key = generateLicenseKey();
// => "mcp-ABCD-EFGH-JKLM"

// Create a signed key with embedded metadata
const signed = createLicenseKey({
  secret: process.env.LICENSE_SECRET!,
  maxCalls: 1000,
  expiresAt: new Date("2026-12-31"),
});
// => "mcp-XXXX-YYYY-ZZZZ.signed_hmac"

// Validate on the server
server.addLicenseKey(signed);
const valid = server.validateKey(signed.key); // LicenseKey | null
```

---

<!-- bmc:middle -->
<p align="center"><a href="https://buymeacoffee.com/dayongfan"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=&amp;slug=dayongfan&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Cookie&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy me a coffee"></a></p>
<!-- /bmc:middle -->

## Rate Limiting

```ts
const server = new PaymentMcpServer({
  name: "my-server",
  version: "1.0.0",
  payment: {
    price: 0.001,
    paymentMethods: ["usdc"],
    walletAddress: "0x...",
    rateLimit: {
      maxCalls: 100,
      windowSeconds: 3600, // Per hour
    },
  },
});

// Check remaining
const remaining = server.remainingRateLimit("user-123");
```

---

## Usage Tracking

```ts
server.tool("my-tool", schema, handler);

// After some calls...
const total = server.getUsage("user-123"); // => 5
const all = server.getAllUsage(); // => { "user-123": 5, "user-456": 12 }
```

---

## Payment Flow

```
User calls tool → Check rate limit → Free tier? → License key? → Payment provider? → Execute / Deny
```

1. **Rate limit** — too many calls? Deny.
2. **Free tier** — remaining free calls? Allow, decrement.
3. **License key** — valid key in `_meta.licenseKey`? Allow.
4. **Payment provider** — verified payment? Allow.
5. **No provider configured** — allow all (dev mode).

---

## Deploy to Cloudflare Workers

```ts
// worker.ts
import { PaymentMcpServer } from "mcp-payment-middleware";

export default {
  async fetch(request: Request, env: Env) {
    const server = new PaymentMcpServer({
      name: "my-remote-server",
      version: "1.0.0",
      payment: {
        price: 0.001,
        paymentMethods: ["usdc"],
        walletAddress: env.WALLET_ADDRESS,
        usdcRpcUrl: "https://arb1.arbitrum.io/rpc",
      },
    });

    // ... register tools, handle MCP transport
  },
};
```

---

## API Reference

### `new PaymentMcpServer(config)`

| Option | Type | Description |
|--------|------|-------------|
| `config.name` | `string` | Server name |
| `config.version` | `string` | Server version |
| `config.payment.price` | `number` | Price per call in USD |
| `config.payment.paymentMethods` | `("usdc" \| "stripe")[]` | Enabled payment methods |
| `config.payment.walletAddress` | `string?` | USDC wallet (required for USDC) |
| `config.payment.stripeSecretKey` | `string?` | Stripe key (required for Stripe) |
| `config.payment.freeTierCalls` | `number?` | Free calls before payment required |
| `config.payment.rateLimit` | `{ maxCalls, windowSeconds }?` | Rate limit config |
| `config.payment.licenseKeys` | `LicenseKey[]?` | Pre-loaded license keys |
| `config.payment.customProviders` | `PaymentProvider[]?` | Custom payment backends |
| `config.payment.usdcChain` | `"arbitrum" \| "base" \| "polygon"?` | Chain for USDC (default: arbitrum) |
| `config.payment.usdcRpcUrl` | `string?` | Custom RPC URL |

### `server.tool(name, schema, handler)`

Same API as `McpServer.tool()`. Handler automatically wrapped with payment checks.

### `server.getUsage(userId)` / `server.getAllUsage()`

Get call counts per user.

### `server.validateKey(keyString)`

Validate a license key. Returns `LicenseKey | null`.

### `withPayment(server, options)`

Wrap an existing `McpServer` instance. Must be called before registering tools.

---

## Philosophy

1. **Open-source first.** The core middleware is free and MIT-licensed. Forever.
2. **Payment-agnostic.** USDC, Stripe, custom — use what works for your users.
3. **One line.** `withPayment(server, options)` — that's the integration surface.
4. **Solo-dev friendly.** No API keys needed for USDC. Built for indie developers.

---

## The Problem

14,000+ MCP servers exist. Fewer than 5% are monetized. Meanwhile, 176M+ agent-to-agent payments have already flowed through x402 ($73M volume).

The payment rails exist. The demand is real. But adding payment to an MCP server requires stitching together 5 different protocols and reading 3 separate specs. That's too much friction for a solo developer with a side project.

**This middleware solves that.**

---

## Roadmap

- [x] Core middleware — `withPayment`, `PaymentMcpServer`
- [x] USDC payment verification (Arbitrum, Base, Polygon)
- [x] Stripe payment verification
- [x] License key generation & validation
- [x] Rate limiting & usage tracking
- [x] Custom payment provider interface
- [ ] Stripe Checkout Session creation (webhook handling)
- [ ] Persistent usage storage (D1, KV, Postgres adapters)
- [ ] Usage dashboard (self-hosted)
- [ ] x402 protocol support

---

*Built in public by [@iPythoning](https://github.com/iPythoning) | MIT License*

<!-- bmc:end -->
<p align="center"><a href="https://buymeacoffee.com/dayongfan"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=&amp;slug=dayongfan&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Cookie&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy me a coffee"></a></p>
<!-- /bmc:end -->
