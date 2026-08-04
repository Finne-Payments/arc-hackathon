/* ============================================================================
   S3 evidence store (AWS-02, PAY-02).
   The production adapter for the EvidenceStore interface. Replaces
   LocalEvidenceStore when EVIDENCE_BUCKET is configured. Bytes never touch the
   backend process for upload/download (presigned PUT/GET) — except for finalize
   (HEAD + a single GET to compute the real sha256) and for agent reading
   (getObjectBytes, fetched once per document when the agent summarizes it).

   The bucket is provisioned in CDK (finne-stack.ts): BlockPublicAccess.BLOCK_ALL,
   KMS-encrypted, versioned. The backend task role already has grantReadWrite on
   the whole bucket + kms:Encrypt/Decrypt. Access control to the *arbiter only*
   is enforced at the route layer (the download endpoint requires evidence:download,
   a reviewer-only permission); the presigned GET is short-lived (5 min).

   Uses the standard AWS SDK credential chain (ECS task role in prod, local
   profile in dev) — never an access key in config.
   ========================================================================== */

import { createHash } from "node:crypto";
import { generateId } from "@finne/domain";
import type {
  EvidenceStore,
  UploadAllocation,
  StoredEvidence,
  UploadScope,
} from "./types.ts";
import { MAX_UPLOAD_BYTES, sanitizeFilename } from "./uploadPolicy.ts";

// Lazy/dynamic require keeps the typing simple and matches the lazy-import
// posture of the model client. The SDK is ESM-compatible.
type S3Client = import("@aws-sdk/client-s3").S3Client;

interface S3StoreOpts {
  bucket: string;
  region: string;
  kmsKeyId?: string | null;
}

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

export class S3EvidenceStore implements EvidenceStore {
  private bucket: string;
  private region: string;
  private kmsKeyId: string | null;
  private pending = new Map<string, PendingUpload>();
  private versionCounter = 0;
  private _clientPromise: Promise<S3Client> | null = null;

  constructor(opts: S3StoreOpts) {
    this.bucket = opts.bucket;
    this.region = opts.region;
    this.kmsKeyId = opts.kmsKeyId ?? null;
  }

  /** Lazily construct + cache the S3 client. */
  private async client(): Promise<S3Client> {
    if (this._clientPromise) return this._clientPromise;
    this._clientPromise = (async () => {
      const { S3Client } = await import("@aws-sdk/client-s3");
      return new S3Client({ region: this.region });
    })();
    return this._clientPromise;
  }

  async allocateUpload(params: {
    scope: UploadScope;
    ownerId: string;
    filename: string;
    mimeType: string;
    declaredSizeBytes: number;
  }): Promise<UploadAllocation> {
    // Sanitize the filename before it becomes part of the S3 key — no path
    // traversal, no control chars (mirrors the local store).
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

    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.client();

    // Enforce the declared size on the presigned PUT itself: S3 rejects a PUT
    // whose body exceeds Content-Length (signed as part of the URL). This is the
    // first line of defense; finalize re-verifies via HEAD.
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: params.mimeType,
      ContentLength: params.declaredSizeBytes,
      ...(this.kmsKeyId ? { ServerSideEncryption: "aws:kms", SSEKMSKeyId: this.kmsKeyId } : {}),
    });
    const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 60 * 15 });

    return {
      uploadId,
      objectKey,
      uploadUrl,
      method: "PUT",
      headers: { "Content-Type": params.mimeType },
      expiresAt,
    };
  }

  async finalizeUpload(uploadId: string): Promise<StoredEvidence> {
    const pending = this.pending.get(uploadId);
    if (!pending) throw new Error(`Upload ${uploadId} not found or already finalized.`);

    const { HeadObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();

    // HEAD the object to verify it actually landed + read its real size.
    const head = await client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: pending.objectKey }),
    );
    const sizeBytes = head.ContentLength ?? pending.declaredSizeBytes;
    const mimeType = (head.ContentType ?? pending.mimeType) as string;

    // Size enforcement: reject a bait-and-switch. The client declared one size
    // on allocate (enforced on the presigned PUT) — re-verify the landed object
    // here so a direct-S3 PUT (bypassing the signed URL) can't sneak past.
    if (sizeBytes > pending.declaredSizeBytes) {
      await this.abandonObject(pending.objectKey);
      this.pending.delete(uploadId);
      throw new Error(
        `Uploaded payload (${sizeBytes} bytes) exceeds the declared size (${pending.declaredSizeBytes} bytes). Upload rejected.`,
      );
    }
    if (sizeBytes > MAX_UPLOAD_BYTES) {
      await this.abandonObject(pending.objectKey);
      this.pending.delete(uploadId);
      throw new Error(`Uploaded payload exceeds the 25 MB limit.`);
    }

    // GET the bytes once to compute the real sha256 (the integrity stamp the
    // arbiter + the EvidenceAnnotation both key off). Size is already capped at
    // MAX_UPLOAD_BYTES above, so this is a bounded read.
    const get = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: pending.objectKey }),
    );
    const buf = await bodyToBytes(get.Body);
    const sha256 = createHash("sha256").update(buf).digest("hex");

    const evidenceId = generateId("ev");
    const version = ++this.versionCounter;
    this.pending.delete(uploadId);

    return { evidenceId, objectKey: pending.objectKey, sha256, mimeType, sizeBytes, version };
  }

  /** Best-effort delete of a rejected object so it doesn't linger in the bucket. */
  private async abandonObject(objectKey: string): Promise<void> {
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await this.client();
      await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    } catch {
      /* best-effort — the rejection still stands; the object may expire via lifecycle */
    }
  }

  async getDownloadUrl(evidenceId: string): Promise<{ url: string; expiresAt: string }> {
    // evidenceId here is the objectKey for the S3 store (the route resolves the
    // evidenceId → objectKey before calling, or passes the key directly). We look
    // it up among pending uploads first; otherwise treat evidenceId AS the key.
    const pending = [...this.pending.values()].find((p) => p.uploadId === evidenceId);
    const objectKey = pending?.objectKey ?? evidenceId;

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.client();
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    const url = await getSignedUrl(client, cmd, { expiresIn: 60 * 5 });
    return { url, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
  }

  async getObjectBytes(objectKey: string): Promise<Uint8Array> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const get = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    return bodyToBytes(get.Body);
  }
}

/** Normalize an S3 Body stream into a Uint8Array. */
async function bodyToBytes(body: unknown): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0);
  // S3 SDK v3 returns a SdkStreamMixin with transformToByteArray.
  const stream = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    transformToWebStream?: () => ReadableStream<Uint8Array>;
  };
  if (typeof stream.transformToByteArray === "function") {
    return stream.transformToByteArray();
  }
  if (typeof stream.transformToWebStream === "function") {
    return new Uint8Array(await readWebStream(stream.transformToWebStream()));
  }
  // Node Readable fallback.
  const chunks: Buffer[] = [];
  const nodeStream = body as NodeJS.ReadableStream;
  for await (const rawChunk of nodeStream) {
    const chunk = rawChunk as unknown;
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    }
  }
  // Buffer is a Uint8Array subclass; copy into a standalone Uint8Array so the
  // typed return is correct under TS's stricter lib.dom typings.
  const merged = Buffer.concat(chunks);
  return new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength);
}

async function readWebStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
