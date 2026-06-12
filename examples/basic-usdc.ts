/**
 * Basic example: MCP server with USDC payment.
 *
 * Usage:
 *   1. Set WALLET_ADDRESS env var (or edit below)
 *   2. npx tsx examples/basic-usdc.ts
 *
 * The server will start and listen on stdio. Tools are automatically
 * gated behind USDC payment verification.
 */
import { PaymentMcpServer } from "../src/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const WALLET = process.env.WALLET_ADDRESS ?? "0x6024AB6263AB33150C4Ab83E74733AD42fdD71C4";

const server = new PaymentMcpServer({
  name: "basic-usdc-example",
  version: "0.1.0",
  payment: {
    price: 0.001,
    paymentMethods: ["usdc"],
    walletAddress: WALLET,
    freeTierCalls: 3,
    rateLimit: {
      maxCalls: 50,
      windowSeconds: 3600,
    },
  },
});

// Free tier: first 3 calls are free
server.tool(
  "hello",
  { name: z.string().describe("Your name") },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}! (This tool costs $0.001 after your free tier)` }],
  }),
);

// Paid from call 1 if free tier exhausted
server.tool(
  "expensive-computation",
  { input: z.string().describe("Input to process") },
  async ({ input }) => ({
    content: [{ type: "text", text: `Processed: ${input.toUpperCase()}` }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server with payment middleware is running on stdio");
}

main().catch(console.error);
