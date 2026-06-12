// Payment middleware for MCP servers
export { PaymentMcpServer, withPayment } from "./server.js";

// Payment providers
export { createUsdcProvider } from "./payment/usdc.js";
export { createStripeProvider } from "./payment/stripe.js";

// License key management
export {
  generateLicenseKey,
  createLicenseKey,
  validateLicenseKey,
  checkLicenseKey,
} from "./license/index.js";

// Middleware
export { RateLimiter, UsageTracker } from "./middleware/rate-limiter.js";

// Types
export type {
  PaymentOptions,
  PaymentProvider,
  PaymentVerification,
  PaymentServerConfig,
  CheckoutSession,
  LicenseKey,
  RateLimitConfig,
  ToolResult,
} from "./types.js";
