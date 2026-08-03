import { dropDataCollections } from "./db.ts";
import { Platform, Recipient, WorkOrder, Meta, ChainEvent, User } from "./models/index.ts";
import { loadEnv } from "./env.ts";
import { hashPassword } from "./auth.ts";

/* ============================================================================
   seedWorld — seeds the OFF-CHAIN context (platforms, recipients, work orders,
   policy). The ON-CHAIN data (payouts, receipts, anchors) comes from the indexer
   watching real PaymentCreated events. This separation keeps the seed honest:
   no fabricated tx hashes, no hardcoded payout data.

   Run after contract deploy + backend start. Then make real pay() calls (via
   the demo script's PayTranches or the UI) and the indexer builds receipts.
   ========================================================================== */

// Wallet addresses come from environment variables so they're not hardcoded.
// For local Anvil these default to the well-known dev accounts; for Arc testnet
// they're set to the real funded wallets.
const PAYER = process.env.PAYER_ADDRESS ?? "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RECIPIENT = process.env.RECIPIENT_ADDRESS ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ARBITER = process.env.ARBITER_ADDRESS ?? "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

export async function seedWorld(): Promise<void> {
  await dropDataCollections();

  // heartbeat so /status isn't stale before the first indexer tick
  await Meta.findOneAndUpdate(
    { key: "indexer:heartbeat" },
    { value: { at: new Date().toISOString(), block: 0 }, updatedAt: new Date().toISOString() },
    { upsert: true },
  );

  await Platform.create({
    key: "northbeam",
    name: "Northbeam Studios",
    payWallet: PAYER,
    refundAddress: PAYER,
    arbiterAddress: ARBITER,
    arbiterName: "Dana Whitfield",
    policySummary: "Money unlocks 30 days after payment unless a dispute is open.",
    policyLockupSeconds: 30 * 86400,
    policyResponseWindowHours: 72,
  });

  await Recipient.create({
    key: "maya",
    displayName: "Maya Reyes",
    walletAddress: RECIPIENT,
    platformKey: "northbeam",
  });

  await WorkOrder.create({
    platformKey: "northbeam",
    recipientKey: "maya",
    description: "Three product videos — spring launch",
    deliverables: [
      { name: "Video 1 — product hero", due: "30 Jun", acceptanceCriteria: "Delivered ready for the site" },
      { name: "Video 2 — feature walkthrough", due: "7 Jul", acceptanceCriteria: "Delivered ready for the site" },
      { name: "Video 3 — customer story cut", due: "12 Jul", acceptanceCriteria: "Delivered ready for the site" },
    ],
    amount: "100",
    currency: "USDC",
    status: "open",
  });

  void loadEnv();

  // --- seeded demo users (password = identity; wallet linked on first connect) ---
  // Each wallet is hard-bound to one UI seat (one wallet ↔ one seat).
  const demoHash = await hashPassword("password123");
  await User.create(
    { email: "dana@northbeam.com", passwordHash: demoHash, role: "reviewer", seat: "arbiter", displayName: "Dana Whitfield", platformKey: "northbeam", walletAddress: ARBITER },
    { email: "maya@recipient.com", passwordHash: demoHash, role: "recipient", seat: "customer", displayName: "Maya Reyes", platformKey: "northbeam", walletAddress: RECIPIENT },
    { email: "viewer@parkline.com", passwordHash: demoHash, role: "platform_viewer", seat: "platform", displayName: "Parkline Viewer", platformKey: "northbeam", walletAddress: null },
  );
  console.log("[seedWorld] demo users: dana@northbeam.com / maya@recipient.com / viewer@parkline.com (password: password123)");
  void ChainEvent;
  console.log("[seedWorld] platform Northbeam Studios + recipient Maya Reyes + work order seeded");
  console.log("[seedWorld] payouts will appear when pay() is called on chain (the indexer detects them)");
}
