import { createApp } from "./app.ts";
import { loadEnv } from "./env.ts";
import { connectDb } from "./db.ts";
import { startIndexer } from "./indexer.ts";
import { startAnchorWorker } from "./anchorWorker.ts";
import { startDeadlineScheduler } from "./scheduler.ts";
import { createV1Router } from "./v1/router.ts";
import { createV1App, mountErrorHandler } from "./v1/app.ts";
import { loadConfig } from "@finne/config";
import { seedDemoPolicyPack } from "./seed/policy-pack.ts";

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

  // Mount the v1 registrar API alongside the legacy routes.
  // v1 health endpoints (/health/live, /health/ready) + all 36 operations (/v1/*).
  const v1config = loadConfig();
  // v1 middleware (CORS, JSON, request-ID) is added via createV1App, then routes.
  const v1App = createV1App(v1config);
  v1App.use(createV1Router(v1config));
  app.use(v1App); // mount as sub-app — all v1 routes become available
  // The v1 error handler is already mounted inside v1App via mountErrorHandler
  // in the test setup. For the server, we call it on v1App before mounting.
  // (mountErrorHandler was called above — see createV1App return pattern.)
  // Actually we need to call mountErrorHandler on v1App after the router:
  mountErrorHandler(v1App);

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
    console.log(`[backend] v1 registrar API at /v1/* + /health/live`);
  });
}

main().catch((e) => {
  console.error("[backend] unhandled startup error:", e);
  process.exit(1);
});
