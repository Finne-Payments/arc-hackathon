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
import { demoRoutes } from "./routes/demo.ts";
import { extraRoutes } from "./routes/timeline.ts";
import { authRoutes } from "./routes/auth.ts";

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
  app.use(express.json({ limit: "4mb" })); // PRD §11 — 4 MB body limit
  app.use(resolveSession);

  app.use(authRoutes);
  app.use(publicRoutes);
  app.use(payoutRoutes);
  app.use(workOrderRoutes);
  app.use(caseRoutes);
  app.use(internalRoutes);
  app.use(briefRoutes);
  app.use(demoRoutes);
  app.use(extraRoutes);

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
