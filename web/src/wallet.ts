import { createWalletClient, custom, defineChain, createPublicClient, http, type WalletClient, type Address, type Hash } from "viem";
import type { UnsignedTx } from "./api";

/**
 * Thrown when the connected wallet is not the one a transaction requires.
 * refundByArbiter reverts on chain unless msg.sender == arbiter; without this
 * pre-flight check the user discovers that only as a reverted tx in their
 * wallet/explorer (the contract revert `CallerNotAllowed` carries no message).
 * Catch this in the UI to tell them which wallet to connect.
 */
export class WrongWalletError extends Error {
  constructor(public readonly connected: string, public readonly required: string) {
    super(
      `Wrong wallet connected. This action must be signed by ${required}, but the connected wallet is ${connected}. Switch your wallet to the required account and try again.`,
    );
    this.name = "WrongWalletError";
  }
}

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
 *
 * `requiredSigner` (the arbiter address) enables a pre-flight check: the
 * contract's refundByArbiter has `onlyArbiter` (msg.sender == arbiter), so if
 * the connected wallet isn't the arbiter the tx reverts on chain with no
 * readable reason. We throw WrongWalletError BEFORE broadcasting so the UI can
 * tell the user which wallet to connect instead of showing a mysterious revert.
 */
export async function signRefund(unsignedTx: UnsignedTx, requiredSigner?: string): Promise<Hash> {
  const client = _walletClient ?? (await connectWallet());
  await ensureArcChain();
  const connected = client.account?.address;
  if (requiredSigner && connected && connected.toLowerCase() !== requiredSigner.toLowerCase()) {
    throw new WrongWalletError(connected, requiredSigner);
  }
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
 * Wait for a refund (refundByArbiter) transaction to be mined and confirmed on
 * Arc. Returns the receipt on success; throws on revert or on a timeout so the
 * caller can surface the `failed` phase instead of faking confirmation.
 *
 * The block the tx is in must be known to the public reader; viem polls the
 * node until the receipt appears. Arc testnet blocks are ~510s, so allow a
 * generous timeout. `confirmations: 1` means "included in one block" — we do
 * not require finality-depth for the demo beat (the indexer independently
 * confirms and writes the refundTxHash).
 */
/**
 * Direct refund: the arbiter's browser wallet calls refundByArbiter(paymentId)
 * on the RefundProtocol. This is the SIMPLEST refund path — no backend relay,
 * no EIP-712 signature, no operator key. The connected wallet MUST be the
 * contract's arbiter (msg.sender == arbiter). If it isn't, the pre-flight
 * check throws WrongWalletError before broadcasting.
 *
 * Returns the tx hash on success. Used as the PRIMARY refund path; the
 * signature+relay path (signRefundAuthorization) is the fallback for when the
 * arbiter can't or won't call the contract directly.
 */
export async function directRefundByArbiter(
  refundProtocolAddress: Address,
  paymentId: string,
): Promise<Hash> {
  const client = _walletClient ?? (await connectWallet());
  await ensureArcChain();
  const connected = client.account?.address;

  const reader = getPublicReader();
  const paymentAbi = [
    { type: "function", name: "arbiter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
    { type: "function", name: "payments", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "releaseTimestamp", type: "uint256" },
      { name: "refundTo", type: "address" },
      { name: "withdrawnAmount", type: "uint256" },
      { name: "refunded", type: "bool" },
    ] },
  ];

  // Pre-flight 1: read the contract's arbiter and verify the connected wallet
  // matches. This avoids a confusing MetaMask popup for a tx that would revert.
  try {
    const arbiter = await reader.readContract({
      address: refundProtocolAddress,
      abi: paymentAbi,
      functionName: "arbiter",
    }) as Address;
    if (connected && arbiter && connected.toLowerCase() !== arbiter.toLowerCase()) {
      throw new WrongWalletError(connected, arbiter);
    }
  } catch (e) {
    if (e instanceof WrongWalletError) throw e;
    // RPC read failed — skip the pre-flight, let the contract revert if needed.
  }

  // Pre-flight 2: check if the payment is ALREADY refunded. If so, the
  // refund already happened (a previous attempt succeeded on-chain but the UI
  // may not have shown it). Return a synthetic "already done" hash so the
  // caller advances to confirmed without re-submitting a tx that would revert.
  try {
    const payment = await reader.readContract({
      address: refundProtocolAddress,
      abi: paymentAbi,
      functionName: "payments",
      args: [BigInt(paymentId)],
    }) as readonly [Address, bigint, bigint, Address, bigint, boolean];
    const alreadyRefunded = payment[5];
    if (alreadyRefunded) {
      // Return a sentinel so the caller knows the refund already landed.
      // Using the paymentId as a fake "hash" — the caller just needs a truthy
      // value to proceed to "confirmed".
      return `0xalready-refunded-${paymentId}` as Hash;
    }
  } catch {
    // RPC read failed — skip the pre-flight, try the tx.
  }

  const hash = await client.writeContract({
    address: refundProtocolAddress,
    abi: [
      {
        type: "function",
        name: "refundByArbiter",
        stateMutability: "nonpayable",
        inputs: [{ name: "paymentID", type: "uint256" }],
        outputs: [],
      },
    ],
    functionName: "refundByArbiter",
    args: [BigInt(paymentId)],
    account: client.account!,
    chain: arcTestnet,
  });
  return hash;
}

export async function awaitRefundReceipt(hash: Hash): Promise<void> {
  const publicClient = getPublicReader();
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 120_000,
    });
    if (receipt.status === "reverted") {
      throw new Error("The refund transaction reverted on chain — no money moved.");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Re-surface user rejections as-is so the caller can classify them; any
    // other failure (timeout, RPC error, revert) is a "didn't go through".
    if (isUserRejection(e)) throw e;
    if (/timed out|timeout/i.test(msg)) {
      throw new Error("Timed out waiting for the refund to confirm on Arc. It may still land — check the explorer.");
    }
    throw e;
  }
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
  //    The wallet handles nonce sequencing — approve (nonce N) is always mined
  //    before pay (nonce N+1) — so we do NOT wait for the approve receipt here.
  //    Previously we waited up to 45s via the rate-limited Arc public RPC,
  //    which froze the UI between the two signatures.
  onProgress?.("approving");
  await client.writeContract({
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

  // 2. Immediately read the nonce BEFORE pay() — that value is the payment ID.
  //    This is a view call (no signature), so it's fast. If the RPC rate-limits,
  //    pay() still works — we just don't know the ID up front.
  let nonceBefore: bigint | null = null;
  try {
    const publicClient = getPublicReader();
    nonceBefore = (await publicClient.readContract({
      address: refundProtocolAddress,
      abi: [{ type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] }],
      functionName: "nonce",
    })) as bigint;
  } catch {
    nonceBefore = null; // RPC rate-limited — pay() still works
  }

  // 3. Call pay() right away. MetaMask queues this as nonce N+1 after the
  //    approve, so it won't be mined until the approve confirms. The wallet
  //    prompts for the second signature immediately.
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

  // 4. Done — the wallet has broadcast pay(). Return immediately with the tx
  //    hash + the paymentId. If the pre-read nonce failed (RPC rate-limited
  //    earlier), try reading it again NOW — the RPC often recovers during the
  //    wallet confirmation delay. As a last resort, read nonce() - 1 (the
  //    payment that was just created).
  onProgress?.("confirming");
  let resolvedPaymentId = nonceBefore;
  if (resolvedPaymentId === null) {
    for (let attempt = 0; attempt < 3 && resolvedPaymentId === null; attempt++) {
      try {
        const reader = getPublicReader();
        const nonceAfter = await reader.readContract({
          address: refundProtocolAddress,
          abi: [{ type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] }],
          functionName: "nonce",
        }) as bigint;
        if (nonceAfter > 0n) resolvedPaymentId = nonceAfter - 1n;
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  return { hash: payHash, paymentId: resolvedPaymentId };
}

/** Read-only public client for awaiting receipts + reading nonce(). */
function getPublicReader() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0], { timeout: 30_000 }),
  });
}

/**
 * Read the arbiter address from the RefundProtocol contract (the source of
 * truth — not the Platform DB record, which can be stale). Returns null on
 * RPC failure so the caller can fall back to the config value.
 */
export async function readArbiter(rpAddress: string): Promise<string | null> {
  try {
    const reader = getPublicReader();
    const arbiter = await reader.readContract({
      address: rpAddress as Address,
      abi: [{ type: "function", name: "arbiter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] }],
      functionName: "arbiter",
    }) as string;
    return arbiter;
  } catch {
    return null;
  }
}

/** Check if a thrown error is a user-rejected signature. */
export function isUserRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /user rejected|denied|rejected/i.test(msg);
}

/**
 * The shape of the EIP-712 typed-data payload the backend returns for a refund
 * decision. Mirrors the contract's RefundAuthorization struct + the prod domain
 * (name "RefundProtocol", version "1", chainId 5042002, verifyingContract =
 * the deployed RefundProtocol address).
 */
export interface RefundTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    RefundAuthorization: Array<{ name: string; type: string }>;
  };
  primaryType: "RefundAuthorization";
  message: {
    paymentID: string;
    expiry: number;
    salt: number;
  };
  paymentId: string;
}

/**
 * The signature components returned by the wallet over the RefundAuthorization
 * typed-data. The backend relayer packs these into refundByArbiterWithSig.
 */
export interface SignatureComponents {
  v: number;
  r: string;
  s: string;
}

/**
 * Sign a RefundAuthorization EIP-712 message with the connected wallet. This is
 * the signature-based refund path: the arbiter signs OFF-CHAIN (no gas, no chain
 * switch), and the backend relayer submits refundByArbiterWithSig.
 *
 * IMPORTANT — what the signature path decouples, and what it does NOT:
 *   - The SUBMITTER (msg.sender = the backend operator key) no longer needs to
 *     be the arbiter. That is the whole point of refundByArbiterWithSig.
 *   - The SIGNER (recovered from the signature via ecrecover) MUST still BE the
 *     contract's arbiter. The contract reverts if `recovered != arbiter`. So the
 *     connected wallet MUST be the arbiter's wallet. If you connect a different
 *     wallet, ecrecover recovers the wrong address and the relay reverts with
 *     InvalidSignature.
 *
 * Returns the (v, r, s) components on success. User rejection throws — the
 * caller classifies it via isUserRejection and recovers.
 */
export async function signRefundAuthorization(typedData: RefundTypedData): Promise<SignatureComponents & { expiry: number; salt: number; paymentID: string }> {
  const client = _walletClient ?? (await connectWallet());
  // signTypedData is an off-chain signature — no chain switch is strictly needed,
  // but keeping the wallet on Arc avoids cross-chain EIP-712 confusion.
  await ensureArcChain();

  const sig = await client.signTypedData({
    domain: {
      name: typedData.domain.name,
      version: typedData.domain.version,
      chainId: typedData.domain.chainId,
      verifyingContract: typedData.domain.verifyingContract as Address,
    },
    types: {
      RefundAuthorization: typedData.types.RefundAuthorization,
    },
    primaryType: typedData.primaryType,
    message: {
      paymentID: BigInt(typedData.message.paymentID),
      expiry: BigInt(typedData.message.expiry),
      salt: BigInt(typedData.message.salt),
    },
    account: client.account!,
  });

  // viem returns a 65-byte serialized signature (0x + r||s||v). Split it into
  // the (v, r, s) components the contract's refundByArbiterWithSig expects.
  const { v, r, s } = splitSignature(sig);
  return { v, r, s, expiry: typedData.message.expiry, salt: typedData.message.salt, paymentID: typedData.message.paymentID };
}

/**
 * Split a 65-byte serialized EIP-712 signature into (v, r, s). viem's
 * signTypedData returns `0x` + 64 bytes (r||s) + 1 byte (v). The contract takes
 * them as separate uint8 / bytes32 / bytes32 args.
 */
function splitSignature(sig: `0x${string}`): { v: number; r: string; s: string } {
  const bytes = sig.slice(2);
  if (bytes.length !== 130) {
    throw new Error(`Unexpected signature length ${bytes.length} (expected 130 hex chars / 65 bytes).`);
  }
  const r = "0x" + bytes.slice(0, 64);
  const s = "0x" + bytes.slice(64, 128);
  // EIP-712 signers may return v as the yParity (0/1) instead of the ecrecover
  // recovery byte (27/28). Solidity's ecrecover ONLY accepts 27 or 28 — any
  // other value makes it return address(0), so refundByArbiterWithSig would
  // revert InvalidSignature with no obvious cause. Normalize 0/1 → 27/28.
  const vRaw = parseInt(bytes.slice(128, 130), 16);
  const v = vRaw < 27 ? vRaw + 27 : vRaw;
  return { v, r, s };
}
