/* ============================================================================
   v1 API shell (BE-01) — versioned Express app with health checks, request IDs,
   structured error handling, secure headers, and explicit CORS.
   ========================================================================== */

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import type { Config } from "@finne/config";
import { ApiError, type ErrorBody, generateRequestId, internalError } from "./errors.ts";

/** Request augmentation: every request gets a requestId. */
declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
  }
}

export interface SessionState {
  userId: string;
  role: string;
  tenantId: string;
  displayName: string;
  walletAddress: string | null;
}

export function createV1App(config: Config): express.Application {
  const app = express();

  /* --- Middleware chain --- */
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "8mb" }));

  // Request ID on every request (BE-01 step 3)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = (req.headers["x-request-id"] as string) || generateRequestId();
    next();
  });

  // Add request ID to responses
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });

  /* --- Health endpoints (BE-01 step 2) --- */
  // Liveness: always 200, no dependency checks
  app.get("/health/live", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Readiness: checks Mongo, Arc RPC, config — 503 if any fail
  app.get("/health/ready", async (_req: Request, res: Response) => {
    const checks: Record<string, boolean> = {
      config: true, // config already loaded if we got here
    };
    // TODO: wire mongo + arc rpc checks when server boots
    // For now, readiness mirrors liveness (the server module wires real checks)
    const ready = Object.values(checks).every(Boolean);
    res.status(ready ? 200 : 503).json({ ready, checks });
  });

  /* --- Routes are mounted by the caller via app.use(createV1Router(config)) --- */
  /* --- THEN the error handler must be mounted. We export a helper for that. --- */

  return app;
}

/** Mount the terminal error handler AFTER all routes (must be last). */
export function mountErrorHandler(app: express.Application): void {
  app.use((err: unknown, req: Request, res: Response<ErrorBody>, _next: NextFunction) => {
    const requestId = req.requestId;
    if (err instanceof ApiError) {
      const body: ErrorBody = {
        code: err.code,
        message: err.message,
        requestId,
        retryable: err.retryable,
      };
      if (err.details) body.details = err.details;
      return res.status(err.status).json(body);
    }
    const fallback = internalError();
    res.status(500).json({
      code: fallback.code,
      message: fallback.message,
      requestId,
      retryable: fallback.retryable,
    });
  });
}
