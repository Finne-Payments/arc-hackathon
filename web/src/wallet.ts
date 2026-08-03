import { createWalletClient, custom, defineChain, createPublicClient, http, type WalletClient, type Address, type Hash } from "viem";
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
  // MetaMask REQUIRES nativeCurrency.decimals === 18 in wallet_addEthereumChain
  // (hard validation — it rejects any other value). Arc's real native gas token
  // is USDC (6 decimals), but declaring 18 here is the only way to add the chain.
  // Side effect: MetaMask's native balance display is off by 10^12 — display only;
  // actual USDC amounts are computed in the app (see NewPayout's 1_000_000 factor).
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
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

  // Prefer `wallet_requestPermissions({ eth_accounts })` over `eth_requestAccounts`.
  // Recent MetaMask builds route `eth_requestAccounts` through their multichain
  // (CAIP-25) session flow, which fails with:
  //   "Received scopeString value(s): eip155:... not supported by the wallet"
  // MetaMask proposes a list of chains the wallet doesn't recognise (none of
  // them Arc) and then rejects its own proposal. Requesting the `eth_accounts`
  // permission directly sidesteps the multichain session entirely. Wallets that
  // don't implement `wallet_requestPermissions` fall back to the standard call.
  let accounts: string[] = [];
  try {
    await (eth.request as (args: { method: string; params?: unknown }) => Promise<unknown>)({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
    accounts =
      (await (eth.request as (args: { method: string }) => Promise<string[]>)({ method: "eth_accounts" })) ?? [];
  } catch (e) {
    // If the user actively rejected the permissions popup, surface that.
    if (isUserRejection(e)) throw e;
    // Otherwise (method unsupported, etc.) fall back to the standard connect.
    accounts =
      (await (eth.request as (args: { method: string }) => Promise<string[]>)({
        method: "eth_requestAccounts",
      })) ?? [];
  }
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

/**
 * The ONE wallet action that creates a protected payout: approve the
 * RefundProtocol to spend the USDC, then call pay(). The payer's signature is
 * the only thing that can move their USDC (the backend holds no payer key).
 *
 * Both steps go through the connected wallet. The previous inline version in
 * NewPayout.tsx called pay() with no prior approve, so USDC.transferFrom
 * reverted on chain and the indexer saw no PaymentCreated event — the on-screen
 * "Payment submitted" was a lie because the tx had reverted.
 *
 * The receipt is awaited so the caller learns the real on-chain outcome before
 * showing a success message. The indexer detects PaymentCreated and builds the
 * payout row (chain-first: no row exists without this confirmation).
 */
export async function approveAndPay(
  refundProtocolAddress: Address,
  usdcAddress: Address,
  recipient: Address,
  amountBaseUnits: bigint,
  refundTo: Address,
  onProgress?: (phase: "connecting" | "approving" | "paying" | "confirming") => void,
): Promise<{ hash: Hash; paymentId: bigint | null }> {
  onProgress?.("connecting");
  const client = _walletClient ?? (await connectWallet());
  await ensureArcChain();

  // 1. Approve the RefundProtocol to spend exactly this amount of USDC.
  onProgress?.("approving");
  const approveHash = await client.writeContract({
    address: usdcAddress,
    abi: [
      {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ],
    functionName: "approve",
    args: [refundProtocolAddress, amountBaseUnits],
    account: client.account!,
    chain: arcTestnet,
  });
  await waitForReceipt(approveHash);

  // 2. Call pay() — the RefundProtocol now pulls the approved USDC via
  //    transferFrom. Read the nonce BEFORE pay() to learn the payment ID.
  const publicClient = getPublicReader();
  const nonceBefore = (await publicClient.readContract({
    address: refundProtocolAddress,
    abi: [{ type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] }],
    functionName: "nonce",
  })) as bigint;

  onProgress?.("paying");
  const payHash = await client.writeContract({
    address: refundProtocolAddress,
    abi: [
      {
        type: "function",
        name: "pay",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "refundTo", type: "address" },
        ],
        outputs: [],
      },
    ],
    functionName: "pay",
    args: [recipient, amountBaseUnits, refundTo],
    account: client.account!,
    chain: arcTestnet,
  });

  // 3. Wait for the receipt — this is the real confirmation. If pay() reverted
  //    (e.g. insufficient balance, blocklist), waitForTransactionReceipt throws
  //    and the caller shows the failure instead of a false "submitted".
  onProgress?.("confirming");
  await waitForReceipt(payHash);

  // The payment ID is the nonce we read before pay() incremented it.
  return { hash: payHash, paymentId: nonceBefore };
}

/** Read-only public client for awaiting receipts + reading nonce(). */
function getPublicReader() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0], { timeout: 30_000 }),
  });
}

/** Await a tx receipt, reusing the wallet's chain definition. */
async function waitForReceipt(hash: Hash): Promise<void> {
  const publicClient = getPublicReader();
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 });
}

/** Check if a thrown error is a user-rejected signature. */
export function isUserRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /user rejected|denied|rejected/i.test(msg);
}
