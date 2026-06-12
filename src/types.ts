import type { z } from "zod";

// ---- Payment Provider Interface ----

export interface PaymentVerification {
  /** Whether the payment was verified */
  verified: boolean;
  /** Payment provider that verified it */
  provider: string;
  /** Transaction/charge ID for reference */
  transactionId?: string;
  /** Human-readable reason if not verified */
  reason?: string;
}

export interface CheckoutSession {
  /** URL the user should visit to complete payment */
  url: string;
  /** Session ID for polling verification */
  sessionId: string;
  /** Amount in USD */
  amount: number;
}

export interface PaymentProvider {
  readonly name: string;
  /** Verify a user has paid a given amount */
  verifyPayment(
    userId: string,
    amount: number,
    metadata?: Record<string, string>,
  ): Promise<PaymentVerification>;
  /** Create a checkout session for one-time payment */
  createCheckoutSession?(
    amount: number,
    metadata?: Record<string, string>,
  ): Promise<CheckoutSession>;
}

// ---- License Key ----

export interface LicenseKey {
  /** The generated key string */
  key: string;
  /** When it was created */
  createdAt: Date;
  /** When it expires (null = never) */
  expiresAt: Date | null;
  /** Max calls allowed (null = unlimited) */
  maxCalls: number | null;
  /** Current call count */
  callCount: number;
  /** Arbitrary metadata */
  metadata: Record<string, string>;
}

// ---- Rate Limiting ----

export interface RateLimitConfig {
  /** Max calls per window */
  maxCalls: number;
  /** Window size in seconds */
  windowSeconds: number;
}

// ---- Payment Middleware Options ----

export interface PaymentOptions {
  /** Price per call in USD */
  price: number;
  /** Payment providers to enable */
  paymentMethods: ("usdc" | "stripe")[];
  /** Stripe secret key (required if stripe is enabled) */
  stripeSecretKey?: string;
  /** USDC wallet address to receive payments (required if usdc is enabled) */
  walletAddress?: string;
  /** USDC chain (default: arbitrum) */
  usdcChain?: "arbitrum" | "base" | "polygon";
  /** Rate limit config (default: unlimited) */
  rateLimit?: RateLimitConfig;
  /** Free tier: number of free calls allowed */
  freeTierCalls?: number;
  /** License key for validation (if using pre-generated keys) */
  licenseKeys?: LicenseKey[];
  /** Custom payment providers */
  customProviders?: PaymentProvider[];
  /** USDC RPC URL (optional, for custom RPC) */
  usdcRpcUrl?: string;
}

// ---- Tool Handler Types ----

export type ToolHandler<T extends z.ZodRawShape> = (
  args: z.infer<z.ZodObject<T>>,
  extra: ToolHandlerExtra,
) => Promise<ToolResult>;

export interface ToolHandlerExtra {
  /** Session ID from the transport */
  sessionId?: string;
  /** Raw request for advanced use cases */
  _meta?: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ---- Server Config ----

export interface PaymentServerConfig {
  name: string;
  version: string;
  payment: PaymentOptions;
}
