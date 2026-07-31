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
import { caseRoutes } from "./routes/cases.ts";
import { internalRoutes } from "./routes/internal.ts";
import { briefRoutes } from "./routes/briefs.ts";
import { demoRoutes } from "./routes/demo.ts";
import { extraRoutes } from "./routes/timeline.ts";
import { authRoutes } from "./routes/auth.ts";

export function createApp(): express.Application {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "4mb" })); // PRD §11 — 4 MB body limit
  app.use(resolveSession);

  app.use(authRoutes);
  app.use(publicRoutes);
  app.use(payoutRoutes);
  app.use(caseRoutes);
  app.use(internalRoutes);
  app.use(briefRoutes);
  app.use(demoRoutes);
  app.use(extraRoutes);

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
