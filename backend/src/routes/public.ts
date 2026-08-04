import { Router } from "express";
import { loadEnv } from "../env.ts";
import { Platform, Recipient, ChainEvent, Meta } from "../models/index.ts";
import { currentSeat, requirePermission } from "../middleware.ts";
import { can } from "../rbac.ts";

/* ============================================================================
   Public routes (no session required for liveness/config/status; /session
   reports the current seat). PRD §11.2.
   ========================================================================== */

export const publicRoutes = Router();

/**
 * @openapi
 * /healthz:
 *   get:
 *     tags: [Public]
 *     summary: Liveness probe
 *     security: []
 *     responses: { 200: { description: "{ ok: true }" } }
 */
publicRoutes.get("/healthz", (_req, res) => {
  res.json({ ok: true }); // liveness only, no DB
});

/**
 * @openapi
 * /config:
 *   get:
 *     tags: [Public]
 *     summary: Chain wiring + platform/recipient config
 *     security: []
 *     responses: { 200: { description: Chain ID, RPC, contract addresses, platform policy } }
 */

publicRoutes.get("/config", async (_req, res, next) => {
  try {
    const env = loadEnv();
    const firstPlatform = await Platform.findOne({});
    const firstRecipient = await Recipient.findOne({});
    res.json({
      chainId: env.arc.chainId,
      rpcUrl: env.arc.rpcUrl,
      explorerUrl: env.arc.explorerUrl,
      chainName: env.arc.chainName,
      refundProtocolAddress: env.arc.refundProtocolAddress,
      caseRegistryAddress: env.arc.caseRegistryAddress,
      usdcAddress: env.arc.usdcAddress,
      // Chain-first readiness: money-mutating endpoints 503 until the contracts
      // are deployed. The UI gates New Payout / Dispute on this.
      chainReady: {
        refundProtocolDeployed: !!env.arc.refundProtocolAddress,
        caseRegistryDeployed: !!env.arc.caseRegistryAddress,
      },
      demoMode: env.demoMode,
      // never expose payWallet (PRD §11.2)
      platform: firstPlatform
        ? {
            name: firstPlatform.name,
            arbiterAddress: firstPlatform.arbiterAddress,
            arbiterName: firstPlatform.arbiterName,
            refundAddress: firstPlatform.refundAddress,
            policy: {
              summary: firstPlatform.policySummary,
              lockupSeconds: firstPlatform.policyLockupSeconds,
              responseWindowHours: firstPlatform.policyResponseWindowHours,
            },
          }
        : null,
      recipient: firstRecipient ? { key: firstRecipient.key, displayName: firstRecipient.displayName, walletAddress: firstRecipient.walletAddress } : null,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /status:
 *   get:
 *     tags: [Public]
 *     summary: Worker heartbeats (indexer, anchor-worker, scheduler) + live chain figures
 *     security: []
 *     responses: { 200: { description: "Worker liveness + chain state (degrades to null on RPC failure)" } }
 */
publicRoutes.get("/status", async (_req, res, next) => {
  try {
    const env = loadEnv();

    // Worker heartbeats — each background loop writes a Meta doc on every tick.
    // staleness thresholds match each worker's own STALE_THRESHOLD_MS (the
    // 15s indexer window here is its /status-specific bound; the worker's own
    // isIndexerStale() uses a looser 90s for internal use).
    const [indexerHb, anchorHb, schedulerHb] = await Promise.all([
      Meta.findOne({ key: "indexer:heartbeat" }),
      Meta.findOne({ key: "anchor-worker:heartbeat" }),
      Meta.findOne({ key: "scheduler:heartbeat" }),
    ]);

    const indexerLastSeenAt = (indexerHb?.value as { at?: string } | null)?.at ?? null;
    const indexerLastBlock = (indexerHb?.value as { block?: number } | null)?.block ?? 0;
    const anchorVal = anchorHb?.value as { at?: string; processed?: number; failed?: number } | null;
    const schedulerVal = schedulerHb?.value as { at?: string; advanced?: number } | null;

    const isStale = (at: string | null, thresholdMs: number) =>
      at ? Date.now() - new Date(at).getTime() > thresholdMs : true;

    // Real chain view reads — arbiter reserve + recipient debt from the RefundProtocol.
    // Degrade to null on RPC failure (PRD §11.2, §13.4 — never error the route).
    let chain: { arbiterReserve: string; recipientDebt: string } | null = null;
    try {
      const { readChainFigures } = await import("../chain/reads.ts");
      const firstPlatform = await Platform.findOne({});
      const firstRecipient = await Recipient.findOne({});
      chain = await readChainFigures(
        (firstPlatform?.arbiterAddress ?? null) as `0x${string}` | null,
        (firstRecipient?.walletAddress ?? null) as `0x${string}` | null,
      );
    } catch {
      chain = null;
    }

    res.json({
      indexer: {
        lastSeenAt: indexerLastSeenAt,
        lastBlock: indexerLastBlock,
        stale: isStale(indexerLastSeenAt, 15_000),
      },
      anchorWorker: {
        lastSeenAt: anchorVal?.at ?? null,
        processed: anchorVal?.processed ?? 0,
        failed: anchorVal?.failed ?? 0,
        stale: isStale(anchorVal?.at ?? null, 30_000),
      },
      scheduler: {
        lastSeenAt: schedulerVal?.at ?? null,
        advanced: schedulerVal?.advanced ?? 0,
        stale: isStale(schedulerVal?.at ?? null, 300_000),
      },
      chain,
      chainReady: {
        refundProtocolDeployed: !!env.arc.refundProtocolAddress,
        caseRegistryDeployed: !!env.arc.caseRegistryAddress,
      },
      demoMode: env.demoMode,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /chain/events:
 *   get:
 *     tags: [Public]
 *     summary: Last 12 chain events (demo status strip)
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "Array of { txHash, eventName, contract, block }" } }
 *     notes: Requires payout:read permission.
 */
publicRoutes.get("/chain/events", requirePermission("payout:read"), async (_req, res, next) => {
  try {
    const events = await ChainEvent.find({}).sort({ seenAt: -1 }).limit(12).lean();
    res.json(
      events.map((e) => ({
        txHash: e.txHash,
        eventName: e.eventName,
        contract: e.contract,
        block: e.block,
      })),
    );
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /session:
 *   get:
 *     tags: [Public]
 *     summary: Current session info + permission list
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ seat, displayName, role, permissions[] }" }
 *       401: { description: Not authenticated }
 */
publicRoutes.get("/session", (req, res) => {
  const seat = currentSeat(req);
  if (!seat || !req.session.role) return res.status(401).json({ error: "Log in first — authentication required." });
  const role = req.session.role;
  // List the permissions for this seat so the UI can gate locally.
  const allPerms = [
    "workorder:create", "workorder:read", "payout:read", "case:open", "case:read",
    "case:respond", "case:add_evidence", "case:request_info", "case:decide",
    "brief:read", "brief:write", "anchor:write", "demo:seed",
  ] as const;
  const permissions = allPerms.filter((p) => can(role, p));
  res.json({ seat, displayName: req.session.displayName, role, permissions });
});
