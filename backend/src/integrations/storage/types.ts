/* ============================================================================
   Adapter interfaces (INT-01, AWS-02).
   Language-neutral boundaries so local implementations work for dev/test
   while real S3/SQS/KMS implementations slot in for staging/submission.
   The product loop never imports S3/SQS/Circle directly — only these interfaces.
   ========================================================================== */

/* -------------------------------------------------------------------------- */
/* Evidence storage (PAY-02, AWS-02)                                          */
/* -------------------------------------------------------------------------- */

export interface UploadAllocation {
  uploadId: string;
  objectKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface StoredEvidence {
  evidenceId: string;
  /** The object key the bytes were stored under (so the caller can record it). */
  objectKey: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
}

/** Where an uploaded document belongs — a dispute case or a payment's work order. */
export type UploadScope = "case" | "workorder";

export interface EvidenceStore {
  /** Allocate an immutable object key + short-lived presigned upload URL. */
  allocateUpload(params: {
    /** Which entity the document belongs to — a dispute case or a work order. */
    scope: UploadScope;
    /** The caseNumber (scope "case") or paymentId (scope "workorder"). */
    ownerId: string;
    filename: string;
    mimeType: string;
    declaredSizeBytes: number;
  }): Promise<UploadAllocation>;

  /** HEAD/read the object after upload: verify size, type, scan, compute sha256. */
  finalizeUpload(uploadId: string): Promise<StoredEvidence>;

  /** Generate a fresh short-lived download URL (authorized per visibility). */
  getDownloadUrl(evidenceId: string): Promise<{ url: string; expiresAt: string }>;

  /** Fetch the raw bytes of a stored object by its objectKey (for agent reading). */
  getObjectBytes(objectKey: string): Promise<Uint8Array>;
}

/* -------------------------------------------------------------------------- */
/* Job queue (BE-07, AWS-02)                                                  */
/* -------------------------------------------------------------------------- */

export interface QueueMessage {
  jobId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface JobQueue {
  /** Enqueue a job, returning the jobId. */
  enqueue(type: string, payload: Record<string, unknown>, opts?: { idempotencyKey?: string; delaySeconds?: number }): Promise<string>;
  /** Dequeue up to `max` messages (with visibility timeout / lease). */
  dequeue(max: number): Promise<QueueMessage[]>;
  /** Delete a message after successful processing. */
  complete(jobId: string): Promise<void>;
  /** Move a message to the DLQ after terminal failure. */
  deadLetter(jobId: string, reason: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Transfer verifier (INT-01, INT-02)                                         */
/* -------------------------------------------------------------------------- */

export interface VerifiedTransfer {
  chainId: number;
  txHash: string;
  blockNumber: number;
  blockTimestamp: string;
  sender: string;
  recipient: string;
  token: string;
  amountMicroUsdc: string;
  finalized: boolean;
}

export interface TransferVerifier {
  /** Verify an ordinary finalized Arc USDC transfer (INT-02). */
  verifyTransfer(txHash: string): Promise<{ status: "VERIFIED" | "REJECTED"; reason?: string; transfer?: VerifiedTransfer }>;
}

/* -------------------------------------------------------------------------- */
/* Registry writer (CON-01–04)                                                */
/* -------------------------------------------------------------------------- */

export interface RegistryWriter {
  registerReceipt(params: {
    paymentId: string;
    receiptHash: string;
    payer: string;
    recipient: string;
    amountMicroUsdc: string;
    paidAt: number;
  }): Promise<{ txHash: string }>;

  openCase(params: {
    caseId: string;
    paymentId: string;
    claimHash: string;
    challengedAmountMicroUsdc: string;
    responseDueAt: number;
  }): Promise<{ txHash: string }>;

  submitResponse(params: {
    caseId: string;
    responseHash: string;
    submittedBy: string;
  }): Promise<{ txHash: string }>;

  anchorAnalysis(params: {
    caseId: string;
    analysisHash: string;
    version: number;
  }): Promise<{ txHash: string }>;

  recordDecision(params: {
    caseId: string;
    decisionHash: string;
    outcome: number;
    correctionAmountMicroUsdc: string;
  }): Promise<{ txHash: string }>;

  recordCorrection(params: {
    caseId: string;
    correctionTxHash: string;
    correctionHash: string;
  }): Promise<{ txHash: string }>;

  closeNoCorrection(caseId: string): Promise<{ txHash: string }>;
}

/* -------------------------------------------------------------------------- */
/* Wallet provider (INT-04, INT-05, INT-06)                                   */
/* -------------------------------------------------------------------------- */

export interface WalletProvider {
  /** Get or create a Circle modular wallet for a recipient (INT-05). */
  getOrCreateWallet(params: { userId: string; tenantId: string }): Promise<{ walletId: string; address: string }>;

  /** Submit a sponsored user operation via Gas Station (INT-06). */
  submitSponsoredTransfer(params: {
    walletId: string;
    destination: string;
    token: string;
    amountMicroUsdc: string;
    chainId: number;
  }): Promise<{ userOpHash: string; providerId: string }>;

  /** Verify an ERC-1271 signature for recipient challenge login (BE-05). */
  verifyOwnership(walletAddress: string, signature: string, challenge: string): Promise<boolean>;
}
