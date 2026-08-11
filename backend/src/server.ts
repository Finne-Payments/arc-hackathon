import { createApp } from "./app.ts";
import { loadEnv } from "./env.ts";
import { connectDb } from "./db.ts";
import { startIndexer } from "./indexer.ts";
import { startAnchorWorker } from "./anchorWorker.ts";
import { startDeadlineScheduler } from "./scheduler.ts";
import { seedDemoPolicyPack } from "./seed/policy-pack.ts";
import { seedNorthwindPack } from "./seed/northwind-pack.ts";
import { seedNorthwindScenario } from "./seed/northwind-scenario.ts";
import { reconcilePayoutPlatformKeys } from "./services.ts";
import { verifyEip712Domain } from "./chain/client.ts";

/* ============================================================================
   Server entry. Boot order (PRD §16.2):
   1. loadEnv() runs the boot-fail assertions FIRST (no money keys).
   2. Connect to Mongo.
   3. Start the indexer (chain watcher) + anchor worker (hash poster).
   4. Start Express on BACKEND_PORT.
   ========================================================================== */

async function main(): Promise<void> {
  const env = loadEnv(); // boot-fail assertions run here

  try {
    await connectDb();
    console.log(`[backend] connected to MongoDB`);
  } catch (e) {
    console.error("[backend] FATAL: cannot connect to MongoDB:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  // Seed the demo policy pack (clauses 4/7/9 + law line) if absent. Idempotent
  // and best-effort — never blocks boot (PRD Addendum A §F, FIN-110/111/112).
  void seedDemoPolicyPack();
  // Seed the Northwind × Kestrel scenario pack (ToS clauses + the top-3
  // governing-law pointers for England & Wales). Same idempotent, best-effort
  // contract. Surfaces the scenario's clauses + law pointers in the case room.
  void seedNorthwindPack();
  // Seed the runnable Northwind scenario (Payout + WorkOrder + Case) so the
  // agent pipeline can run end-to-end on CASE-NW01. Same idempotent, best-
  // effort contract. Must run after the policy pack so clauses are in force.
  void seedNorthwindScenario();

  // Reconcile payout platformKeys AFTER the seeds (so the Platform collection is
  // populated). Corrects payouts stamped with a stale platformKey (the payer's
  // address prefix / seat key) that are invisible to the scoped reviewer and
  // that the indexer can't self-heal once they age out of its rolling window.
  // Idempotent + best-effort — never blocks boot.
  void reconcilePayoutPlatformKeys();

  if (!env.registryOperatorKey) {
    console.warn("[backend] REGISTRY_OPERATOR_PRIVATE_KEY not set — anchor jobs will queue indefinitely.");
  }

  // EIP-712 domain check (EIP-5267): confirm the deployed RefundProtocol binds
  // its refund-auth signatures to the same (name, version, chainId, contract)
  // the backend builds in buildRefundTypedData(). A mismatch silently breaks
  // every refundByArbiterWithSig (InvalidSignature with no obvious cause).
  // Best-effort: a missing contract / RPC failure / old-deployed-bytecode
  // (predating eip712Domain) logs and continues; only a *successful read with
  // wrong values* throws to fail boot loudly. Runs after env load, before the
  // indexer starts, so a bad config is caught before any tx is relayed.
  if (env.arc.refundProtocolAddress) {
    try {
      const dom = await verifyEip712Domain();
      if (dom) {
        console.log(`[backend] EIP-712 domain OK: ${dom.name}/${dom.version} @ ${dom.verifyingContract} (chain ${dom.chainId})`);
      }
    } catch (e) {
      console.error(`[backend] FATAL: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  }

  // Start the on-chain watchers if chain addresses are configured.
  if (env.arc.refundProtocolAddress || env.arc.caseRegistryAddress) {
    startIndexer();
    if (env.registryOperatorKey && env.arc.caseRegistryAddress) {
      startAnchorWorker();
    } else {
      console.warn("[backend] anchor worker not started (need REGISTRY_OPERATOR_PRIVATE_KEY + CASE_REGISTRY_ADDRESS)");
    }
  } else {
    console.warn("[backend] no chain addresses configured — indexer + anchor worker idle");
  }

  // The deadline scheduler advances cases whose response window has lapsed
  // (GAP-B13). It runs whenever the DB is up — not chain-dependent.
  startDeadlineScheduler();

  const app = createApp();

  // Serve the web SPA static files (built into /app/web/dist by the Dockerfile).
  // Any non-API route falls through to index.html (React Router handles client-side routing).
  const webDist = "/app/web/dist";
  try {
    const fs = await import("node:fs");
    if (fs.existsSync(webDist) && fs.existsSync(`${webDist}/index.html`)) {
      app.use((await import("express")).static(webDist));
      app.get("*", (_req: unknown, res: unknown) => {
        (res as { sendFile: (f: string) => void }).sendFile(`${webDist}/index.html`);
      });
      console.log("[backend] serving web SPA from /app/web/dist");
    }
  } catch {
    // No web dist — API-only mode (dev/test)
  }

  app.listen(env.backendPort, () => {
    console.log(`[backend] Finné API on :${env.backendPort} (demoMode=${env.demoMode})`);
  });
}

main().catch((e) => {
  console.error("[backend] unhandled startup error:", e);
  process.exit(1);
});
