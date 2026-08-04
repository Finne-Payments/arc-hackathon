import express from "express";
import cors from "cors";
import type { Request, Response, NextFunction } from "express";
import { resolveSession } from "./middleware.ts";
import { HttpError } from "./errors.ts";
import { IllegalTransitionError } from "./stateMachines.ts";
import { AppendOnlyViolationError } from "./models/appendOnly.ts";
import { ForbiddenFindingFieldError, InvalidBriefError } from "./findings.ts";
import { publicRoutes } from "./routes/public.ts";
import { payoutRoutes } from "./routes/payouts.ts";
import { workOrderRoutes } from "./routes/workorders.ts";
import { caseRoutes } from "./routes/cases.ts";
import { internalRoutes } from "./routes/internal.ts";
import { briefRoutes } from "./routes/briefs.ts";
import { extraRoutes } from "./routes/timeline.ts";
import { authRoutes } from "./routes/auth.ts";
import { notificationRoutes } from "./routes/notifications.ts";
import { addressBookRoutes } from "./routes/addressBook.ts";
import { walletRoutes } from "./routes/wallet.ts";
import { localUploadRoutes } from "./integrations/storage/localUploadRoutes.ts";

/** Mount Swagger UI at /api-docs. Gracefully skips if the packages aren't installed. */
async function setupSwagger(app: express.Application): Promise<void> {
  try {
    // @ts-ignore — swagger-ui-express may not be installed in stripped deployments
    const swaggerUi = (await import("swagger-ui-express")).default;
    // @ts-ignore — swagger.ts imports swagger-jsdoc which may not be installed
    const { swaggerSpec } = await import("./swagger.ts");
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));
    console.log("[backend] Swagger UI at /api-docs");
  } catch {
    console.warn("[backend] swagger-ui-express not installed — /api-docs unavailable");
  }
}

export function createApp(): express.Application {
  const app = express();
  app.use(cors());

  // Strip the /api prefix used by the frontend. The SPA always calls /api/<x>
  // (web/src/api.ts → API_BASE = "/api"), but the routers below mount at /<x>
  // (e.g. /auth/wallet, /wallet/balance) with no /api prefix. In dev the Vite
  // proxy strips /api (vite.config.ts), and in docker-compose nginx strips it
  // (nginx.conf.template). In the production single-container deploy the
  // backend serves the SPA itself (server.ts) with no proxy in front, so we
  // strip /api here — otherwise /api/auth/wallet hits Express verbatim and 404s.
  // This is a no-op when the prefix is already absent (dev/compose). /api-docs
  // and /api-docs.json are left untouched (they don't match /api/ or /api).
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url.startsWith("/api/")) {
      req.url = req.url.slice(4); // drop "/api", keep the leading "/"
    } else if (req.url === "/api") {
      req.url = "/";
    }
    next();
  });

  // Local-dev upload/download receivers (raw-body routes for LocalEvidenceStore).
  // MUST be mounted BEFORE express.json so the raw binary PUT body is read as a
  // stream, not parsed as JSON. In prod the S3 store replaces these with real
  // presigned URLs, so the routes are never hit. See localUploadRoutes.ts.
  app.use(localUploadRoutes);

  app.use(express.json({ limit: "4mb" })); // PRD §11 — 4 MB body limit
  app.use(resolveSession);

  app.use(authRoutes);
  app.use(publicRoutes);
  app.use(payoutRoutes);
  app.use(workOrderRoutes);
  app.use(caseRoutes);
  app.use(internalRoutes);
  app.use(briefRoutes);
  app.use(extraRoutes);
  app.use(notificationRoutes);
  app.use(addressBookRoutes);
  app.use(walletRoutes);

  // Swagger UI — mounted at /api-docs. Falls back gracefully if the packages
  // aren't installed (e.g. in a stripped-down deployment).
  setupSwagger(app);

  // Terminal error handler — produces the plain-language error envelope (PRD §11.1).
  // Placed last; falls through from any next(err).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof IllegalTransitionError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof AppendOnlyViolationError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof ForbiddenFindingFieldError || err instanceof InvalidBriefError) {
      return res.status(422).json({ error: err.message });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    // Unknown — the 500 copy deliberately reaffirms the money invariant (PRD §11.1).
    console.error("[backend] unhandled error:", err);
    return res.status(500).json({ error: "Something went wrong on our side. Nothing has changed on chain." });
  });

  return app;
}
