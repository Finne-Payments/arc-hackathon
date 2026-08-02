import { createApp } from "./app.ts";
import { loadEnv } from "./env.ts";
import { connectDb } from "./db.ts";
import { startIndexer } from "./indexer.ts";
import { startAnchorWorker } from "./anchorWorker.ts";
import { startDeadlineScheduler } from "./scheduler.ts";

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

  if (!env.registryOperatorKey) {
    console.warn("[backend] REGISTRY_OPERATOR_PRIVATE_KEY not set — anchor jobs will queue indefinitely.");
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
  app.listen(env.backendPort, () => {
    console.log(`[backend] Finné API on :${env.backendPort} (demoMode=${env.demoMode})`);
  });
}

main().catch((e) => {
  console.error("[backend] unhandled startup error:", e);
  process.exit(1);
});
