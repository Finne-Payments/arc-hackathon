import { createWalletClient, custom, defineChain, type WalletClient, type Address, type Hash } from "viem";
import type { UnsignedTx } from "./api";

/* ============================================================================
   Wallet integration (PRD §14.3, D1/D11).
   Detects an injected EIP-1193 provider (window.ethereum) and exposes two
   signing actions the UI calls:
     - signRefund(unsignedTx): the reviewer's wallet signs refundByArbiter
     - signWithdraw(paymentId): the recipient's wallet signs withdraw

   Before signing, the wallet is switched to the Arc testnet chain (GAP-W2) —
   previously `chain: null` was passed, which left the wallet on whatever chain
   it was on and produced confusing failures. When no wallet is detected, the
   UI falls back to the labeled simulation (D11).
   ========================================================================== */

/** Arc testnet chain definition (matches backend ARC_CHAIN_ID etc.). */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export interface WalletState {
  available: boolean;
  address: string | null;
  chainId: number | null;
}

let _walletClient: WalletClient | null = null;

/** Detect an injected EIP-1193 provider (MetaMask, Rabby, etc.). */
export function detectWallet(): WalletState {
  const eth = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
  return {
    available: !!eth,
    address: null,
    chainId: null,
  };
}

/**
 * Ensure the connected wallet is on the Arc testnet chain (GAP-W2). Prompts the
 * user to switch (or add the chain if their wallet doesn't know it). No-op if
 * already on Arc. Safe to call before every signature.
 */
export async function ensureArcChain(): Promise<void> {
  const eth = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown>; chainId?: string } }).ethereum;
  if (!eth) return;
  const currentHex = await (eth.request as (args: { method: string }) => Promise<string>)({ method: "eth_chainId" }).catch(() => "0x0");
  const currentId = parseInt(currentHex, 16);
  if (currentId === arcTestnet.id) return;
  try {
    await (eth.request as (args: unknown) => Promise<unknown>)({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + arcTestnet.id.toString(16) }],
    });
  } catch (err) {
    // 4902 / -32603: the chain isn't known to the wallet — add it, then switch.
    const code = (err as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      await (eth.request as (args: unknown) => Promise<unknown>)({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x" + arcTestnet.id.toString(16),
            chainName: arcTestnet.name,
            nativeCurrency: arcTestnet.nativeCurrency,
            rpcUrls: [arcTestnet.rpcUrls.default.http[0]],
            blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

/** Request account access and build a wallet client. Throws if the user rejects. */
export async function connectWallet(): Promise<WalletClient> {
  const eth = (window as unknown as { ethereum?: Record<string, unknown> }).ethereum;
  if (!eth) throw new Error("No wallet found. Install MetaMask or another EIP-1193 wallet.");

  const accounts = (await (eth.request as (args: { method: string }) => Promise<string[]>)({ method: "eth_requestAccounts" })) ?? [];
  if (accounts.length === 0) throw new Error("No account available.");

  await ensureArcChain();

  _walletClient = createWalletClient({
    account: accounts[0] as Address,
    chain: arcTestnet,
    transport: custom(eth as never),
  });
  return _walletClient;
}

export function getWalletClient(): WalletClient | null {
  return _walletClient;
}

/**
 * Sign a refund: the reviewer's browser wallet calls refundByArbiter(paymentId)
 * on the RefundProtocol. Returns the transaction hash on success.
 * User rejection throws — the caller classifies it and recovers (D11).
 */
export async function signRefund(unsignedTx: UnsignedTx): Promise<Hash> {
  const client = _walletClient ?? (await connectWallet());
  await ensureArcChain();
  const hash = await client.writeContract({
    address: unsignedTx.to as Address,
    abi: unsignedTx.abi as never,
    functionName: unsignedTx.functionName,
    args: unsignedTx.args as never,
    account: client.account!,
    chain: arcTestnet,
  });
  return hash;
}

/**
 * Sign a withdrawal: the recipient's wallet calls withdraw([paymentId]).
 * Returns the transaction hash on success.
 */
export async function signWithdraw(
  refundProtocolAddress: string,
  paymentId: string,
): Promise<Hash> {
  const client = _walletClient ?? (await connectWallet());
  await ensureArcChain();
  const hash = await client.writeContract({
    address: refundProtocolAddress as Address,
    abi: [
      {
        type: "function",
        name: "withdraw",
        stateMutability: "nonpayable",
        inputs: [{ name: "paymentIDs", type: "uint256[]" }],
        outputs: [],
      },
    ],
    functionName: "withdraw",
    args: [[BigInt(paymentId)]],
    account: client.account!,
    chain: arcTestnet,
  });
  return hash;
}

/** Check if a thrown error is a user-rejected signature. */
export function isUserRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /user rejected|denied|rejected/i.test(msg);
}
