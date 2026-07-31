import { Router } from "express";
import { requirePermission } from "../middleware.ts";
import { Brief } from "../models/index.ts";
import { validateBriefPayload } from "../findings.ts";
import { nextBriefVersion } from "../services.ts";
import { loadEnv } from "../env.ts";

/* ============================================================================
   Agent brief routes (PRD §11.2, §13.3). The brief is findings only — the
   verdict-guard (validateBriefPayload) rejects any recommendation-shaped key
   at any depth → 422. The Mongoose schema `strict:'throw'` is the second layer.
   ========================================================================== */

export const briefRoutes = Router();

briefRoutes.get("/agent/briefs/:caseId", requirePermission("brief:read"), async (req, res, next) => {
  try {
    const versions = await Brief.find({ caseRef: req.params.caseId }).sort({ version: 1 }).lean();
    res.json({ latest: versions.length ? versions[versions.length - 1] : null, versions: versions.length });
  } catch (e) {
    next(e);
  }
});

briefRoutes.post("/agent/briefs", requirePermission("brief:write"), async (req, res, next) => {
  try {
    validateBriefPayload(req.body); // throws ForbiddenFindingFieldError / InvalidBriefError → 422
    const version = req.body.caseRef ? await nextBriefVersion(req.body.caseRef) : 1;
    const env = loadEnv();
    const doc = await Brief.create({
      caseRef: req.body.caseRef ?? null,
      payoutRef: req.body.payoutRef,
      version,
      checks: req.body.checks,
      inconsistencies: req.body.inconsistencies,
      missingItems: req.body.missingItems,
      generatedAt: new Date().toISOString(),
      agentVersion: env.arc.chainName, // placeholder; real agent stamps AGENT_VERSION
    });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
});
