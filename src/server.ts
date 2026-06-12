import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  LicenseKey,
  PaymentOptions,
  PaymentProvider,
} from "./types.js";
import { createStripeProvider } from "./payment/stripe.js";
import { createUsdcProvider } from "./payment/usdc.js";
import { RateLimiter, UsageTracker } from "./middleware/rate-limiter.js";
import { checkLicenseKey, validateLicenseKey } from "./license/index.js";

// ---- Payment Guard ----

interface PaymentGuardState {
  providers: PaymentProvider[];
  rateLimiter?: RateLimiter;
  usageTracker: UsageTracker;
  licenses: LicenseKey[];
  licenseSecret?: string;
  price: number;
  freeTierCalls: number;
}

type Extra = {
  sessionId?: string;
  _meta?: Record<string, unknown>;
};

/** Payment error response — returned when payment/rate-limit blocks a call */
const PAYMENT_REQUIRED = {
  content: [
    {
      type: "text" as const,
      text: "Payment required. Please purchase access to use this tool.",
    },
  ],
  isError: true,
};

const RATE_LIMITED = {
  content: [
    {
      type: "text" as const,
      text: "Rate limit exceeded. Try again later.",
    },
  ],
  isError: true,
};

export function createPaymentGuard(state: PaymentGuardState) {
  return async function verify(
    extra: Extra,
  ): Promise<typeof PAYMENT_REQUIRED | null> {
    const userId =
      extra.sessionId ??
      (extra._meta?.["userId"] as string | undefined) ??
      "anonymous";

    // 1. Rate limit
    if (state.rateLimiter && !state.rateLimiter.check(userId)) {
      return RATE_LIMITED;
    }

    // 2. Free tier
    if (state.usageTracker.getCount(userId) < state.freeTierCalls) {
      state.usageTracker.increment(userId);
      return null;
    }

    // 3. License key
    const licenseKey = extra._meta?.["licenseKey"] as string | undefined;
    if (licenseKey) {
      const preloaded = checkLicenseKey(licenseKey, state.licenses);
      if (preloaded) {
        const stored = state.licenses.find((l) => l.key === licenseKey);
        if (stored) stored.callCount++;
        state.usageTracker.increment(userId);
        return null;
      }
      if (state.licenseSecret) {
        const valid = validateLicenseKey(licenseKey, state.licenseSecret);
        if (valid) {
          state.usageTracker.increment(userId);
          return null;
        }
      }
    }

    // 4. Payment provider
    if (state.providers.length > 0) {
      for (const provider of state.providers) {
        const result = await provider.verifyPayment(userId, state.price);
        if (result.verified) {
          state.usageTracker.increment(userId);
          return null;
        }
      }
      return PAYMENT_REQUIRED;
    }

    // No payment provider configured — allow all
    state.usageTracker.increment(userId);
    return null;
  };
}

// ---- PaymentMcpServer ----

/**
 * MCP Server wrapper that adds payment, rate limiting, and license key support.
 */
export class PaymentMcpServer {
  private server: McpServer;
  private guard: ReturnType<typeof createPaymentGuard>;
  private state: PaymentGuardState;

  constructor(config: {
    name: string;
    version: string;
    payment: PaymentOptions;
  }) {
    this.server = new McpServer({
      name: config.name,
      version: config.version,
    });

    this.state = {
      providers: [],
      usageTracker: new UsageTracker(),
      licenses: config.payment.licenseKeys ?? [],
      price: config.payment.price,
      freeTierCalls: config.payment.freeTierCalls ?? 0,
    };

    this.initProviders(config.payment);

    if (config.payment.rateLimit) {
      this.state.rateLimiter = new RateLimiter(config.payment.rateLimit);
    }

    this.guard = createPaymentGuard(this.state);
  }

  // ---- Tool Registration ----

  /**
   * Register a paid tool. Automatically checks payment/rate-limit before execution.
   * Delegates to the underlying McpServer.tool() — all overloads supported.
   */
  tool(...args: unknown[]): unknown {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const serverTool = this.server.tool as (...a: unknown[]) => unknown;
    const guard = this.guard;

    const lastIdx = args.length - 1;
    if (typeof args[lastIdx] === "function") {
      const originalHandler = args[lastIdx] as (...hArgs: unknown[]) => unknown;
      args[lastIdx] = async (...hArgs: unknown[]) => {
        const extra = (hArgs.length === 2 ? hArgs[1] : hArgs[0]) as Extra;
        const blocked = await guard(extra);
        if (blocked) return blocked;
        return originalHandler(...hArgs);
      };
    }

    return serverTool.apply(this.server, args);
  }

  /**
   * Register a tool with config object. Same as tool() but uses the registerTool API.
   */
  registerTool(...args: unknown[]): unknown {
    const serverRegisterTool = this.server.registerTool as (...a: unknown[]) => unknown;
    const guard = this.guard;

    const lastIdx = args.length - 1;
    if (typeof args[lastIdx] === "function") {
      const originalHandler = args[lastIdx] as (...hArgs: unknown[]) => unknown;
      args[lastIdx] = async (...hArgs: unknown[]) => {
        const extra = (hArgs.length === 2 ? hArgs[1] : hArgs[0]) as Extra;
        const blocked = await guard(extra);
        if (blocked) return blocked;
        return originalHandler(...hArgs);
      };
    }

    return serverRegisterTool.apply(this.server, args);
  }

  // ---- Lifecycle ----

  connect(transport: Parameters<McpServer["connect"]>[0]): Promise<void> {
    return this.server.connect(transport);
  }

  close(): Promise<void> {
    return this.server.close();
  }

  // ---- License Keys ----

  setLicenseSecret(secret: string): void {
    this.state.licenseSecret = secret;
  }

  addLicenseKey(key: LicenseKey): void {
    this.state.licenses.push(key);
  }

  validateKey(keyString: string): LicenseKey | null {
    const preloaded = checkLicenseKey(keyString, this.state.licenses);
    if (preloaded) return preloaded;
    if (this.state.licenseSecret) {
      return validateLicenseKey(keyString, this.state.licenseSecret);
    }
    return null;
  }

  // ---- Usage ----

  getUsage(userId: string): number {
    return this.state.usageTracker.getCount(userId);
  }

  getAllUsage(): Record<string, number> {
    return this.state.usageTracker.getAll();
  }

  remainingRateLimit(key: string): number | null {
    return this.state.rateLimiter?.remaining(key) ?? null;
  }

  getInnerServer(): McpServer {
    return this.server;
  }

  // ---- Internal ----

  private initProviders(options: PaymentOptions): void {
    if (options.paymentMethods.includes("usdc")) {
      if (!options.walletAddress) {
        throw new Error("walletAddress is required when using USDC payments");
      }
      this.state.providers.push(
        createUsdcProvider({
          walletAddress: options.walletAddress,
          chain: options.usdcChain,
          rpcUrl: options.usdcRpcUrl,
        }),
      );
    }

    if (options.paymentMethods.includes("stripe")) {
      if (!options.stripeSecretKey) {
        throw new Error(
          "stripeSecretKey is required when using Stripe payments",
        );
      }
      this.state.providers.push(
        createStripeProvider({ secretKey: options.stripeSecretKey }),
      );
    }

    for (const provider of options.customProviders ?? []) {
      this.state.providers.push(provider);
    }
  }
}

// ---- withPayment (convenience wrapper) ----

/**
 * Wrap an existing McpServer with payment middleware.
 * Must be called BEFORE registering tools.
 */
export function withPayment(
  server: McpServer,
  options: PaymentOptions,
): McpServer {
  const providers: PaymentProvider[] = [];

  if (options.paymentMethods.includes("usdc")) {
    if (!options.walletAddress) {
      throw new Error("walletAddress is required when using USDC payments");
    }
    providers.push(
      createUsdcProvider({
        walletAddress: options.walletAddress,
        chain: options.usdcChain,
        rpcUrl: options.usdcRpcUrl,
      }),
    );
  }

  const guard = createPaymentGuard({
    providers,
    usageTracker: new UsageTracker(),
    licenses: options.licenseKeys ?? [],
    price: options.price,
    freeTierCalls: options.freeTierCalls ?? 0,
    rateLimiter: options.rateLimit
      ? new RateLimiter(options.rateLimit)
      : undefined,
  });

  // Intercept tool registration to wrap handlers with payment checks
  const originalTool = server.tool.bind(server) as (...args: unknown[]) => unknown;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = function tool(
    this: McpServer,
    ...args: unknown[]
  ): unknown {
    const lastIdx = args.length - 1;
    if (typeof args[lastIdx] === "function") {
      const originalHandler = args[lastIdx] as (...hArgs: unknown[]) => unknown;
      args[lastIdx] = async (...hArgs: unknown[]) => {
        const extra = (hArgs.length === 2 ? hArgs[1] : hArgs[0]) as Extra;
        const blocked = await guard(extra);
        if (blocked) return blocked;
        return originalHandler(...hArgs);
      };
    }
    return originalTool.apply(server, args);
  };

  return server;
}
