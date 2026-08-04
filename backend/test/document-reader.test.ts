import { describe, it, expect, beforeEach } from "vitest";
import { resetLocalStore, getLocalStore } from "../src/integrations/storage/localStore.ts";
import { readDocumentText } from "../src/agent/documentReader.ts";

/* ============================================================================
   Document reader — verifies text extraction (markdown/plain) + the never-
   throws contract (P8). Uses the local store so bytes are real.
   ========================================================================== */

beforeEach(() => {
  resetLocalStore();
});

describe("readDocumentText", () => {
  it("extracts UTF-8 text from a markdown document", async () => {
    const store = getLocalStore();
    const content = "# Service Agreement\n\nMerchant delivers 3 videos.\nFee: 5000 USDC.";
    const alloc = await store.allocateUpload({
      scope: "case",
      ownerId: "CASE-1",
      filename: "agreement.md",
      mimeType: "text/markdown",
      declaredSizeBytes: content.length,
    });
    store.setUploadBytes(alloc.uploadId, new TextEncoder().encode(content));
    await store.finalizeUpload(alloc.uploadId);

    const result = await readDocumentText(alloc.objectKey, "text/markdown");
    expect(result.text).toContain("Service Agreement");
    expect(result.text).toContain("5000 USDC");
    expect(result.readerType).toBe("text");
    expect(result.bytes).toBe(content.length);
  });

  it("returns null text for an unknown objectKey without throwing", async () => {
    const result = await readDocumentText("missing/key.md", "text/markdown");
    expect(result.text).toBeNull();
    expect(result.bytes).toBe(0);
  });

  it("caps extracted text to a sensible length", async () => {
    const store = getLocalStore();
    const big = "x".repeat(20_000);
    const alloc = await store.allocateUpload({
      scope: "case",
      ownerId: "CASE-2",
      filename: "big.txt",
      mimeType: "text/plain",
      declaredSizeBytes: big.length,
    });
    store.setUploadBytes(alloc.uploadId, new TextEncoder().encode(big));
    await store.finalizeUpload(alloc.uploadId);

    const result = await readDocumentText(alloc.objectKey, "text/plain");
    expect(result.text!.length).toBeLessThanOrEqual(12_000);
  });

  it("returns null text for an opaque binary mime (no extractor)", async () => {
    const store = getLocalStore();
    const alloc = await store.allocateUpload({
      scope: "case",
      ownerId: "CASE-3",
      filename: "image.png",
      mimeType: "image/png",
      declaredSizeBytes: 4,
    });
    store.setUploadBytes(alloc.uploadId, new Uint8Array([1, 2, 3, 4]));
    await store.finalizeUpload(alloc.uploadId);

    const result = await readDocumentText(alloc.objectKey, "image/png");
    expect(result.text).toBeNull();
    expect(result.bytes).toBe(4);
  });
});
