import type { PaymentProvider, PaymentVerification, CheckoutSession } from "../types.js";

/**
 * Stripe payment provider.
 * Requires a Stripe secret key. Supports one-time payments via Checkout Sessions.
 */
export function createStripeProvider(options: {
  secretKey: string;
  /** Optional: price ID for a pre-configured Stripe product */
  priceId?: string;
  /** Optional: success URL for redirect after payment */
  successUrl?: string;
  /** Optional: cancel URL for redirect after cancel */
  cancelUrl?: string;
}): PaymentProvider {
  let stripeModule: unknown = null;

  async function getStripe(): Promise<{
    checkout: {
      sessions: {
        create: (params: Record<string, unknown>) => Promise<{ id: string; url: string | null }>;
        retrieve: (id: string) => Promise<{ payment_status: string; id: string }>;
      };
    };
  }> {
    if (stripeModule) return stripeModule as ReturnType<typeof getStripe>;

    try {
      // Dynamic import so stripe is optional
      const Stripe = (await import("stripe")).default;
      stripeModule = new Stripe(options.secretKey);
      return stripeModule as ReturnType<typeof getStripe>;
    } catch {
      throw new Error(
        "Stripe SDK not installed. Run: npm install stripe",
      );
    }
  }

  return {
    name: "stripe",

    async verifyPayment(
      userId: string,
    ): Promise<PaymentVerification> {
      try {
        const stripe = await getStripe();
        // Check for completed checkout sessions for this user
        const session = await stripe.checkout.sessions.retrieve(userId);

        if (session.payment_status === "paid") {
          return {
            verified: true,
            provider: "stripe",
            transactionId: session.id,
          };
        }

        return {
          verified: false,
          provider: "stripe",
          reason: `Payment status: ${session.payment_status}`,
        };
      } catch (err) {
        const message = (err as Error).message;
        // "No such checkout session" is expected for invalid IDs
        if (message.includes("No such") || message.includes("404")) {
          return {
            verified: false,
            provider: "stripe",
            reason: "No payment found for this user",
          };
        }
        return {
          verified: false,
          provider: "stripe",
          reason: `Stripe error: ${message}`,
        };
      }
    },

    async createCheckoutSession(
      amount: number,
      metadata?: Record<string, string>,
    ): Promise<CheckoutSession> {
      const stripe = await getStripe();

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "MCP Server Access",
                description: "One-time payment for MCP server access",
              },
              unit_amount: Math.round(amount * 100), // Stripe uses cents
            },
            quantity: 1,
          },
        ],
        metadata,
        success_url: options.successUrl ?? "https://example.com/success",
        cancel_url: options.cancelUrl ?? "https://example.com/cancel",
      });

      return {
        url: session.url!,
        sessionId: session.id,
        amount,
      };
    },
  };
}
