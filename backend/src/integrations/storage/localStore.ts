/* ============================================================================
   Local evidence store — in-memory implementation for dev/test (PAY-02, AWS-02).
   When EVIDENCE_BUCKET is configured, a real S3 adapter replaces this.
   Never represents mocks as live evidence: evidence is labeled OFFCHAIN_FIXTURE
   until a real imported transaction passes verification (FND-05 step 4).
   ========================================================================== */

import { createHash } from "node:crypto";
import { generateId } from "@finne/domain";
import type { EvidenceStore, UploadAllocation, StoredEvidence, UploadScope } from "./types.ts";
import { MAX_UPLOAD_BYTES, sanitizeFilename } from "./uploadPolicy.ts";

interface PendingUpload {
  uploadId: string;
  objectKey: string;
  scope: UploadScope;
  ownerId: string;
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
  scope: UploadScope;
  ownerId: string;
  filename: string;
  storedAt: string;
  bytes?: Uint8Array; // local-dev only: the actual bytes (so agents can read them locally)
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
  /** Local-dev upload bytes keyed by uploadId, written by the PUT receiver route. */
  private uploadBytes = new Map<string, Uint8Array>();

  /** Used by the local-dev PUT receiver to stash bytes for finalizeUpload. */
  setUploadBytes(uploadId: string, bytes: Uint8Array): void {
    this.uploadBytes.set(uploadId, bytes);
  }

  async allocateUpload(params: {
    scope: UploadScope;
    ownerId: string;
    filename: string;
    mimeType: string;
    declaredSizeBytes: number;
  }): Promise<UploadAllocation> {
    // Sanitize the filename BEFORE it becomes part of the object key — no path
    // traversal, no control chars. The owner id is also constrained by the route
    // (a case number / payment id, never user free text).
    const safeFilename = sanitizeFilename(params.filename);
    const uploadId = generateId("upload");
    const objectKey = `evidence/${params.scope}/${params.ownerId}/${uploadId}/${safeFilename}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    this.pending.set(uploadId, {
      uploadId,
      objectKey,
      scope: params.scope,
      ownerId: params.ownerId,
      filename: safeFilename,
      mimeType: params.mimeType,
      declaredSizeBytes: params.declaredSizeBytes,
      createdAt: new Date().toISOString(),
    });

    // In the local impl, the "presigned URL" is a route on the backend itself.
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

    // The local PUT receiver stashed the real bytes (if any). Use them to compute
    // a real sha256; fall back to a deterministic hash from metadata when the PUT
    // receiver was bypassed (e.g. legacy tests that skip the PUT step).
    const bytes = this.uploadBytes.get(uploadId);

    // Size enforcement: reject a bait-and-switch — the client PUTs more bytes
    // than it declared on allocate, or more than the hard cap. Both are refused
    // so a misbehaving client can't blow memory or stash oversized payloads.
    if (bytes && bytes.length > pending.declaredSizeBytes) {
      this.pending.delete(uploadId);
      this.uploadBytes.delete(uploadId);
      throw new Error(
        `Uploaded payload (${bytes.length} bytes) exceeds the declared size (${pending.declaredSizeBytes} bytes). Upload rejected.`,
      );
    }
    if (bytes && bytes.length > MAX_UPLOAD_BYTES) {
      this.pending.delete(uploadId);
      this.uploadBytes.delete(uploadId);
      throw new Error(`Uploaded payload exceeds the 25 MB limit.`);
    }

    const sha256 = bytes
      ? createHash("sha256").update(bytes).digest("hex")
      : createHash("sha256")
          .update(`${pending.scope}:${pending.ownerId}:${pending.filename}:${pending.mimeType}:${pending.declaredSizeBytes}`)
          .digest("hex");
    const sizeBytes = bytes ? bytes.length : pending.declaredSizeBytes;

    const evidenceId = generateId("ev");
    const version = ++this.versionCounter;
    const stored: StoredObject = {
      evidenceId,
      objectKey: pending.objectKey,
      sha256,
      mimeType: pending.mimeType,
      sizeBytes,
      version,
      scope: pending.scope,
      ownerId: pending.ownerId,
      filename: pending.filename,
      storedAt: new Date().toISOString(),
      bytes,
    };
    this.stored.set(evidenceId, stored);
    this.pending.delete(uploadId);
    this.uploadBytes.delete(uploadId);

    return {
      evidenceId,
      objectKey: pending.objectKey,
      sha256,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      version,
    };
  }

  async getDownloadUrl(objectKey: string): Promise<{ url: string; expiresAt: string }> {
    // Look up by objectKey (the route resolves evidenceId → objectKey first, or
    // passes the key directly). The local-download route serves bytes by evidenceId.
    const obj = [...this.stored.values()].find((o) => o.objectKey === objectKey);
    if (!obj) throw new Error(`Evidence for objectKey ${objectKey} not found.`);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return {
      url: `http://localhost:4000/v1/local-download/${obj.evidenceId}`,
      expiresAt,
    };
  }

  async getObjectBytes(objectKey: string): Promise<Uint8Array> {
    const obj = [...this.stored.values()].find((o) => o.objectKey === objectKey);
    if (obj?.bytes) return obj.bytes;
    // Local dev fallback: no bytes were captured (e.g. test skipped the PUT step).
    // Return an empty payload so the reader degrades to "no text" rather than throwing.
    return new Uint8Array(0);
  }

  /** Look up a stored object by evidenceId (used by local-download + routes). */
  getStored(evidenceId: string): StoredObject | undefined {
    return this.stored.get(evidenceId);
  }
}

let _singleton: LocalEvidenceStore | null = null;
/** The shared local-dev store (one instance across the process). */
export function getLocalStore(): LocalEvidenceStore {
  if (!_singleton) _singleton = new LocalEvidenceStore();
  return _singleton;
}

/** Reset the singleton + the factory cache (tests). */
export function resetLocalStore(): void {
  _singleton = null;
  _factoryStorePromise = null;
}

/**
 * Factory: returns the configured evidence store (S3 in prod, local in dev).
 * Kept here so existing `import { getEvidenceStore } from ".../localStore.ts"`
 * callers resolve to the S3-vs-local decision. The S3 store is constructed only
 * when EVIDENCE_BUCKET is configured; otherwise the shared local singleton.
 *
 * NOTE: this is async because the S3 adapter + config are loaded via dynamic
 * import() (the project is ESM — require() does not work here, which previously
 * silently fell through to the local store even when EVIDENCE_BUCKET was set).
 * Callers must await this. The first call constructs + caches the store.
 */
let _factoryStorePromise: Promise<EvidenceStore> | null = null;
export function getEvidenceStore(): Promise<EvidenceStore> {
  if (_factoryStorePromise) return _factoryStorePromise;
  _factoryStorePromise = (async () => {
    try {
      const { loadConfig } = await import("@finne/config");
      const config = loadConfig();
      const bucket = config.storage.evidenceBucket;
      if (bucket && bucket.trim().length > 0) {
        const { S3EvidenceStore } = await import("./s3Store.ts");
        return new S3EvidenceStore({
          bucket,
          region: process.env.AWS_REGION ?? "us-east-1",
          kmsKeyId: config.storage.kmsKeyId,
        });
      }
    } catch (e) {
      console.warn("[evidence-store] S3 setup failed, falling back to local:", e instanceof Error ? e.message : e);
    }
    return getLocalStore();
  })();
  return _factoryStorePromise;
}

/** Test hook: override the factory's store (or clear with null). Resets the cache. */
export function setEvidenceStoreForTest(store: EvidenceStore | null): void {
  _factoryStorePromise = store ? Promise.resolve(store) : null;
}
