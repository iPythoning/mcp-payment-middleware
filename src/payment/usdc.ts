import type { PaymentProvider, PaymentVerification } from "../types.js";

const USDC_ADDRESSES: Record<string, string> = {
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

const DEFAULT_RPC_URLS: Record<string, string> = {
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base: "https://mainnet.base.org",
  polygon: "https://polygon-rpc.com",
};

const USDC_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Minimal on-chain USDC payment verifier.
 * Works without API keys — uses public RPC endpoints.
 */
export function createUsdcProvider(options: {
  walletAddress: string;
  chain?: "arbitrum" | "base" | "polygon";
  rpcUrl?: string;
}): PaymentProvider {
  const chain = options.chain ?? "arbitrum";
  const rpcUrl = options.rpcUrl ?? DEFAULT_RPC_URLS[chain];
  const usdcAddress = USDC_ADDRESSES[chain];
  const walletAddress = options.walletAddress.toLowerCase();

  return {
    name: "usdc",
    async verifyPayment(
      userId: string,
      amount: number,
    ): Promise<PaymentVerification> {
      try {
        const result = await checkTransfer({
          rpcUrl,
          usdcAddress,
          recipient: walletAddress,
          minAmount: amount,
        });

        if (result.found) {
          return {
            verified: true,
            provider: "usdc",
            transactionId: result.txHash,
          };
        }

        return {
          verified: false,
          provider: "usdc",
          reason: "No matching USDC transfer found",
        };
      } catch (err) {
        return {
          verified: false,
          provider: "usdc",
          reason: `RPC error: ${(err as Error).message}`,
        };
      }
    },
  };
}

interface TransferCheck {
  found: boolean;
  txHash?: string;
}

async function checkTransfer(opts: {
  rpcUrl: string;
  usdcAddress: string;
  recipient: string;
  minAmount: number;
}): Promise<TransferCheck> {
  const { rpcUrl, usdcAddress, recipient, minAmount } = opts;

  // Encode the event topic + recipient address
  const paddedRecipient = "0x" + recipient.slice(2).padStart(64, "0");

  const params = {
    address: usdcAddress,
    topics: [USDC_TRANSFER_TOPIC, null, paddedRecipient],
    fromBlock: "0x0",
    toBlock: "latest",
  };

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [params],
    }),
  });

  const data = (await response.json()) as {
    result?: Array<{
      transactionHash: string;
      data: string;
      blockNumber: string;
    }>;
    error?: { message: string };
  };

  if (data.error) {
    // Range too large — try recent blocks only
    return checkRecentTransfers(rpcUrl, usdcAddress, recipient, minAmount);
  }

  const logs = data.result ?? [];
  for (const log of logs) {
    const value = BigInt(log.data);
    const minWei = BigInt(Math.floor(minAmount * 1e6)); // USDC has 6 decimals
    if (value >= minWei) {
      return { found: true, txHash: log.transactionHash };
    }
  }

  return { found: false };
}

async function checkRecentTransfers(
  rpcUrl: string,
  usdcAddress: string,
  recipient: string,
  minAmount: number,
): Promise<TransferCheck> {
  // Fallback: check last 10000 blocks
  const paddedRecipient = "0x" + recipient.slice(2).padStart(64, "0");

  // Get current block number
  const blockResp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
  });
  const blockData = (await blockResp.json()) as { result: string };
  const currentBlock = BigInt(blockData.result);
  const fromBlock = "0x" + (currentBlock - 10000n).toString(16);

  const params = {
    address: usdcAddress,
    topics: [USDC_TRANSFER_TOPIC, null, paddedRecipient],
    fromBlock,
    toBlock: "latest",
  };

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [params],
    }),
  });

  const data = (await response.json()) as {
    result?: Array<{ transactionHash: string; data: string }>;
  };

  const logs = data.result ?? [];
  for (const log of logs) {
    const value = BigInt(log.data);
    const minWei = BigInt(Math.floor(minAmount * 1e6));
    if (value >= minWei) {
      return { found: true, txHash: log.transactionHash };
    }
  }

  return { found: false };
}
