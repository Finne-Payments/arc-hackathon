/* ============================================================================
   Local-dev upload/download receiver routes (PAY-02).
   LocalEvidenceStore returns presigned-style URLs pointing at these routes
   (http://localhost:4000/v1/local-upload/:uploadId and /local-download/:evidenceId)
   so the full allocate → PUT → finalize → GET flow works locally without S3.
   In staging/submission the S3 store replaces these with real presigned URLs and
   these routes are simply never hit (the URLs point at S3 instead).

   These routes deliberately accept a RAW body (not express.json) so binary file
   bytes are captured verbatim. They must be mounted before express.json parses
   the body — see app.ts, where this router is mounted at the very top.
   ========================================================================== */

import { Router, type Request, type Response, type NextFunction } from "express";
import { getLocalStore } from "./localStore.ts";

export const localUploadRoutes = Router();

/** Capture raw PUT bytes for a local-dev upload. Mounted before express.json. */
localUploadRoutes.put(
  "/v1/local-upload/:uploadId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId } = req.params;
      // Collect the raw body chunks. express.json is bypassed for this route
      // (mounted before it), so req is a plain stream.
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      await new Promise<void>((resolve, reject) => {
        req.on("end", () => resolve());
        req.on("error", reject);
      });
      const bytes = new Uint8Array(Buffer.concat(chunks));
      getLocalStore().setUploadBytes(uploadId, bytes);
      res.status(200).json({ ok: true, uploadId, receivedBytes: bytes.length });
    } catch (e) {
      next(e);
    }
  },
);

/** Serve raw bytes back for a local-dev download (the presigned GET stand-in). */
localUploadRoutes.get(
  "/v1/local-download/:evidenceId",
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { evidenceId } = req.params;
      const stored = getLocalStore().getStored(evidenceId);
      if (!stored) {
        return res.status(404).json({ error: `Evidence ${evidenceId} not found.` });
      }
      const bytes = stored.bytes ?? new Uint8Array(0);
      res.setHeader("Content-Type", stored.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", String(bytes.length));
      res.end(Buffer.from(bytes));
    } catch (e) {
      next(e);
    }
  },
);
