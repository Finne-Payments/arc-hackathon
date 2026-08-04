/* ============================================================================
   Local evidence store — in-memory implementation for dev/test (PAY-02, AWS-02).
   When EVIDENCE_BUCKET is configured, a real S3 adapter replaces this.
   Never represents mocks as live evidence: evidence is labeled OFFCHAIN_FIXTURE
   until a real imported transaction passes verification (FND-05 step 4).
   ========================================================================== */

import { createHash } from "node:crypto";
import { generateId } from "@finne/domain";
import type { EvidenceStore, UploadAllocation, StoredEvidence } from "./types.ts";

interface PendingUpload {
  uploadId: string;
  objectKey: string;
  caseId: string;
  filename: string;
  mimeType: string;
  declaredSizeBytes: number;
  createdAt: string;
}

interface StoredObject {
  evidenceId: string;
  objectKey: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  caseId: string;
  filename: string;
  storedAt: string;
}

/**
 * In-memory evidence store. Used when EVIDENCE_BUCKET is not configured.
 * In staging/submission, the S3 adapter (backend/src/integrations/storage/s3Store.ts)
 * replaces this with the same interface.
 */
export class LocalEvidenceStore implements EvidenceStore {
  private pending = new Map<string, PendingUpload>();
  private stored = new Map<string, StoredObject>();
  private versionCounter = 0;

  async allocateUpload(params: {
    caseId: string;
    filename: string;
    mimeType: string;
    declaredSizeBytes: number;
  }): Promise<UploadAllocation> {
    const uploadId = generateId("upload");
    const objectKey = `evidence/${params.caseId}/${uploadId}/${params.filename}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    this.pending.set(uploadId, {
      uploadId,
      objectKey,
      ...params,
      createdAt: new Date().toISOString(),
    });

    // In the local impl, the "presigned URL" is a data: URL placeholder.
    // The real S3 impl generates a presigned PUT URL.
    return {
      uploadId,
      objectKey,
      uploadUrl: `http://localhost:4000/v1/local-upload/${uploadId}`,
      method: "PUT",
      headers: { "Content-Type": params.mimeType },
      expiresAt,
    };
  }

  async finalizeUpload(uploadId: string): Promise<StoredEvidence> {
    const pending = this.pending.get(uploadId);
    if (!pending) throw new Error(`Upload ${uploadId} not found or already finalized.`);

    // In the local impl, there's no real object to HEAD. We compute a
    // deterministic sha256 from the upload metadata (the real S3 impl reads
    // the actual object bytes and computes the real hash).
    const hashInput = `${pending.caseId}:${pending.filename}:${pending.mimeType}:${pending.declaredSizeBytes}`;
    const sha256 = createHash("sha256").update(hashInput).digest("hex");

    const evidenceId = generateId("ev");
    const version = ++this.versionCounter;
    const stored: StoredObject = {
      evidenceId,
      objectKey: pending.objectKey,
      sha256,
      mimeType: pending.mimeType,
      sizeBytes: pending.declaredSizeBytes,
      version,
      caseId: pending.caseId,
      filename: pending.filename,
      storedAt: new Date().toISOString(),
    };
    this.stored.set(evidenceId, stored);
    this.pending.delete(uploadId);

    return {
      evidenceId,
      sha256,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      version,
    };
  }

  async getDownloadUrl(evidenceId: string): Promise<{ url: string; expiresAt: string }> {
    const obj = this.stored.get(evidenceId);
    if (!obj) throw new Error(`Evidence ${evidenceId} not found.`);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return {
      url: `http://localhost:4000/v1/local-download/${evidenceId}`,
      expiresAt,
    };
  }
}

/** Factory: returns the configured evidence store (S3 in prod, local in dev). */
export function getEvidenceStore(/* config: Config */): EvidenceStore {
  // When config.storage.evidenceBucket is set, return new S3EvidenceStore(config).
  // For now, return the local impl.
  return new LocalEvidenceStore();
}
