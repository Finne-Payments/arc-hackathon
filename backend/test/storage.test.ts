import { describe, it, expect, beforeEach } from "vitest";
import { LocalEvidenceStore, resetLocalStore, getLocalStore } from "../src/integrations/storage/localStore.ts";

/* ============================================================================
   Evidence store round-trip — the allocate → PUT → finalize → download →
   getObjectBytes flow that the local-dev store supports. This is the same
   contract the S3 store implements in prod, so it pins the interface.
   ========================================================================== */

let store: LocalEvidenceStore;

beforeEach(() => {
  resetLocalStore();
  store = getLocalStore();
});

describe("LocalEvidenceStore", () => {
  it("allocates an upload with a presigned-style URL + objectKey", async () => {
    const alloc = await store.allocateUpload({
      scope: "case",
      ownerId: "CASE-001",
      filename: "contract.pdf",
      mimeType: "application/pdf",
      declaredSizeBytes: 1024,
    });
    expect(alloc.uploadId).toBeTruthy();
    expect(alloc.objectKey).toContain("evidence/case/CASE-001/");
    expect(alloc.objectKey).toContain("contract.pdf");
    expect(alloc.method).toBe("PUT");
    expect(alloc.uploadUrl).toContain(alloc.uploadId);
    expect(alloc.headers["Content-Type"]).toBe("application/pdf");
  });

  it("finalizes an upload and returns a sha256 + size from the real bytes", async () => {
    const alloc = await store.allocateUpload({
      scope: "case",
      ownerId: "CASE-001",
      filename: "notes.md",
      mimeType: "text/markdown",
      declaredSizeBytes: 100,
    });
    // Simulate the client PUT: stash the bytes the local receiver would capture.
    const bytes = new TextEncoder().encode("# Contract\nDeliverable: 3 videos by Friday.");
    store.setUploadBytes(alloc.uploadId, bytes);

    const stored = await store.finalizeUpload(alloc.uploadId);
    expect(stored.sizeBytes).toBe(bytes.length);
    expect(stored.mimeType).toBe("text/markdown");
    expect(stored.sha256).toHaveLength(64); // hex sha256
    expect(stored.objectKey).toBe(alloc.objectKey);
  });

  it("issues a short-lived download URL after finalize", async () => {
    const alloc = await store.allocateUpload({
      scope: "workorder",
      ownerId: "PAY-9",
      filename: "spec.txt",
      mimeType: "text/plain",
      declaredSizeBytes: 5,
    });
    store.setUploadBytes(alloc.uploadId, new TextEncoder().encode("hello"));
    const stored = await store.finalizeUpload(alloc.uploadId);

    const dl = await store.getDownloadUrl(stored.objectKey);
    // The local download URL serves bytes by evidenceId (the S3 store uses the objectKey).
    expect(dl.url).toContain("/v1/local-download/");
    expect(dl.expiresAt).toBeTruthy();
  });

  it("getObjectBytes returns the original bytes for agent reading", async () => {
    const alloc = await store.allocateUpload({
      scope: "case",
      ownerId: "CASE-002",
      filename: "readme.md",
      mimeType: "text/markdown",
      declaredSizeBytes: 12,
    });
    const original = new TextEncoder().encode("hello world!");
    store.setUploadBytes(alloc.uploadId, original);
    await store.finalizeUpload(alloc.uploadId);

    const fetched = await store.getObjectBytes(alloc.objectKey);
    expect(fetched.length).toBe(original.length);
    expect(new TextDecoder().decode(fetched)).toBe("hello world!");
  });

  it("getObjectBytes returns empty for an unknown key (never throws)", async () => {
    const fetched = await store.getObjectBytes("does/not/exist");
    expect(fetched.length).toBe(0);
  });

  it("throws when finalizing an unknown uploadId", async () => {
    await expect(store.finalizeUpload("nope")).rejects.toThrow(/not found/);
  });

  it("sanitizes the filename in the object key (no path traversal)", async () => {
    const alloc = await store.allocateUpload({
      scope: "case",
      ownerId: "CASE-1",
      filename: "../../../etc/passwd",
      mimeType: "application/pdf",
      declaredSizeBytes: 10,
    });
    // The traversal must be stripped — only "passwd" remains in the key.
    expect(alloc.objectKey).not.toContain("../");
    expect(alloc.objectKey).not.toContain("etc/");
    expect(alloc.objectKey).toContain("passwd");
  });

  it("rejects a bait-and-switch: actual payload larger than declared", async () => {
    const alloc = await store.allocateUpload({
      scope: "case",
      ownerId: "CASE-1",
      filename: "trick.pdf",
      mimeType: "application/pdf",
      declaredSizeBytes: 5, // declared small…
    });
    // …but PUTs a larger payload.
    store.setUploadBytes(alloc.uploadId, new TextEncoder().encode("this is way more than 5 bytes"));
    await expect(store.finalizeUpload(alloc.uploadId)).rejects.toThrow(/exceeds the declared size/);
  });
});
