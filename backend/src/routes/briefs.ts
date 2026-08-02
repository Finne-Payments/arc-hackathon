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

/**
 * @openapi
 * /agent/briefs/{caseId}:
 *   get:
 *     tags: [Briefs]
 *     summary: Get agent brief versions for a case (findings only — no verdicts)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: caseId, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "{ latest, versions }" } }
 *     notes: Requires `brief:read`.
 */
briefRoutes.get("/agent/briefs/:caseId", requirePermission("brief:read"), async (req, res, next) => {
  try {
    const versions = await Brief.find({ caseRef: req.params.caseId }).sort({ version: 1 }).lean();
    res.json({ latest: versions.length ? versions[versions.length - 1] : null, versions: versions.length });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /agent/briefs:
 *   post:
 *     tags: [Briefs]
 *     summary: Write an agent brief (findings only — verdict-shaped keys rejected → 422)
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [payoutRef, checks], properties: { caseRef: {type: string}, payoutRef: {type: string}, checks: {type: array}, inconsistencies: {type: array}, missingItems: {type: array} } } } } }
 *     responses: { 201: { description: "Brief written (version = count + 1)" }, 422: { description: "Forbidden verdict field or invalid brief" } }
 *     notes: Requires `brief:write` (agent_service only).
 */
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
