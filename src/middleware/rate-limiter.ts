import type { RateLimitConfig } from "../types.js";

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter. Tracks call counts per key in sliding windows.
 */
export class RateLimiter {
  private windows = new Map<string, WindowState>();

  constructor(private config: RateLimitConfig) {}

  /**
   * Check if a key is allowed to make a call.
   * Returns true if allowed, false if rate limited.
   */
  check(key: string): boolean {
    const now = Date.now();
    let window = this.windows.get(key);

    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + this.config.windowSeconds * 1000 };
      this.windows.set(key, window);
    }

    if (window.count >= this.config.maxCalls) {
      return false;
    }

    window.count++;
    return true;
  }

  /**
   * Get remaining calls for a key in the current window.
   */
  remaining(key: string): number {
    const now = Date.now();
    const window = this.windows.get(key);
    if (!window || now >= window.resetAt) return this.config.maxCalls;
    return Math.max(0, this.config.maxCalls - window.count);
  }

  /**
   * Reset all windows. Useful for testing.
   */
  reset(): void {
    this.windows.clear();
  }
}

/**
 * Usage tracker. Stores call counts per user for billing/metring.
 */
export class UsageTracker {
  private counts = new Map<string, number>();

  /** Increment call count for a user */
  increment(userId: string): number {
    const current = this.counts.get(userId) ?? 0;
    const next = current + 1;
    this.counts.set(userId, next);
    return next;
  }

  /** Get total calls for a user */
  getCount(userId: string): number {
    return this.counts.get(userId) ?? 0;
  }

  /** Get all usage data */
  getAll(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  /** Reset all tracking */
  reset(): void {
    this.counts.clear();
  }
}
