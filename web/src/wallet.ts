import { createWalletClient, custom, type WalletClient, type Address, type Hash } from "viem";
import type { UnsignedTx } from "./api";

/* ============================================================================
   Wallet integration (PRD §14.3, D1/D11).
   Detects an injected EIP-1193 provider (window.ethereum) and exposes two
   signing actions the UI calls:
     - signRefund(unsignedTx): the reviewer's wallet signs refundByArbiter
     - signWithdraw(paymentId): the recipient's wallet signs withdraw

   When no wallet is detected, the UI falls back to the labeled simulation
   (D11). With a wallet + chain attached, the real path wins — the indexer
   independently confirms the on-chain result (the UI is never the source of
   truth).
   ========================================================================== */

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

/** Request account access and build a wallet client. Throws if the user rejects. */
export async function connectWallet(): Promise<WalletClient> {
  const eth = (window as unknown as { ethereum?: Record<string, unknown> }).ethereum;
  if (!eth) throw new Error("No wallet found. Install MetaMask or another EIP-1193 wallet.");

  const accounts = (await (eth.request as (args: { method: string }) => Promise<string[]>)({ method: "eth_requestAccounts" })) ?? [];
  if (accounts.length === 0) throw new Error("No account available.");

  _walletClient = createWalletClient({
    account: accounts[0] as Address,
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
  const hash = await client.writeContract({
    address: unsignedTx.to as Address,
    abi: unsignedTx.abi as never,
    functionName: unsignedTx.functionName,
    args: unsignedTx.args as never,
    account: client.account!,
    chain: null,
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
    chain: null,
  });
  return hash;
}

/** Check if a thrown error is a user-rejected signature. */
export function isUserRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /user rejected|denied|rejected/i.test(msg);
}
