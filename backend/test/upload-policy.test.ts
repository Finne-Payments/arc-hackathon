import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  validateUploadDeclaration,
  sanitizeFilename,
  isValidVideoLink,
  linkProviderLabel,
  isVideoMime,
  isDocumentMime,
  isAllowedMime,
  guessMimeFromFilename,
  hasAllowedExtension,
} from "../src/integrations/storage/uploadPolicy.ts";

/* ============================================================================
   Upload policy — the single source of truth for what a user may upload.
   Pins: accepted mimes/extensions (docs + videos), size cap, filename
   sanitization (no traversal/control chars), and link validation (any HTTPS
   video provider, SSRF-hardened).
   ========================================================================== */

describe("validateUploadDeclaration", () => {
  it("accepts a document with a valid mime + size", () => {
    expect(validateUploadDeclaration({ filename: "contract.pdf", mimeType: "application/pdf", declaredSizeBytes: 1024 }).ok).toBe(true);
  });

  it("accepts a video file (mp4)", () => {
    expect(validateUploadDeclaration({ filename: "demo.mp4", mimeType: "video/mp4", declaredSizeBytes: 5_000_000 }).ok).toBe(true);
  });

  it("accepts when mime is missing but the extension is allowed", () => {
    expect(validateUploadDeclaration({ filename: "notes.md", mimeType: "", declaredSizeBytes: 100 }).ok).toBe(true);
  });

  it("rejects an unsupported mime AND extension", () => {
    const r = validateUploadDeclaration({ filename: "payload.exe", mimeType: "application/x-msdownload", declaredSizeBytes: 100 });
    expect(r.ok).toBe(false);
  });

  it("rejects an empty filename", () => {
    expect(validateUploadDeclaration({ filename: "", mimeType: "application/pdf", declaredSizeBytes: 100 }).ok).toBe(false);
  });

  it("rejects a non-positive size", () => {
    expect(validateUploadDeclaration({ filename: "a.pdf", mimeType: "application/pdf", declaredSizeBytes: 0 }).ok).toBe(false);
    expect(validateUploadDeclaration({ filename: "a.pdf", mimeType: "application/pdf", declaredSizeBytes: -5 }).ok).toBe(false);
  });

  it("rejects a payload over the 25 MB cap", () => {
    const r = validateUploadDeclaration({ filename: "big.mp4", mimeType: "video/mp4", declaredSizeBytes: MAX_UPLOAD_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("strips path components (no traversal)", () => {
    expect(sanitizeFilename("../../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("a/b/c\\d.txt")).toBe("d.txt");
  });

  it("removes control characters and NUL", () => {
    expect(sanitizeFilename("na\x00me.txt")).toBe("name.txt");
    expect(sanitizeFilename("ro\x07ot.pdf")).toBe("root.pdf");
  });

  it("collapses whitespace runs", () => {
    expect(sanitizeFilename("my   contract   v2.pdf")).toBe("my contract v2.pdf");
  });

  it("bounds the length while keeping the extension", () => {
    const long = "a".repeat(200) + ".pdf";
    const out = sanitizeFilename(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("falls back to a safe name for empty/dot-only inputs", () => {
    expect(sanitizeFilename("")).toBe("document");
    expect(sanitizeFilename(".")).toBe("document");
    expect(sanitizeFilename("..")).toBe("document");
  });

  it("preserves a normal filename unchanged", () => {
    expect(sanitizeFilename("Service-Agreement.pdf")).toBe("Service-Agreement.pdf");
  });
});

describe("link validation", () => {
  it("accepts any HTTPS video provider", () => {
    expect(isValidVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidVideoLink("https://youtu.be/abc123")).toBe(true);
    expect(isValidVideoLink("https://www.loom.com/share/abc123")).toBe(true);
    expect(isValidVideoLink("https://vimeo.com/123456789")).toBe(true);
    expect(isValidVideoLink("https://app.finne.io/walkthrough/xyz")).toBe(true);
    expect(isValidVideoLink("https://some-other-host.example.com/video/1")).toBe(true);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isValidVideoLink("javascript:alert(1)")).toBe(false);
    expect(isValidVideoLink("file:///etc/passwd")).toBe(false);
    expect(isValidVideoLink("ftp://example.com/video.mp4")).toBe(false);
  });

  it("rejects localhost / loopback / link-local (SSRF guard)", () => {
    expect(isValidVideoLink("http://localhost/video")).toBe(false);
    expect(isValidVideoLink("http://127.0.0.1/video")).toBe(false);
    expect(isValidVideoLink("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isValidVideoLink("http://sub.localhost/x")).toBe(false);
  });

  it("rejects bare IPs (requires a DNS hostname)", () => {
    expect(isValidVideoLink("http://192.168.1.1/video")).toBe(false);
    expect(isValidVideoLink("http://10.0.0.5/video")).toBe(false);
  });

  it("rejects garbage / empty input", () => {
    expect(isValidVideoLink("")).toBe(false);
    expect(isValidVideoLink("not a url")).toBe(false);
  });
});

describe("linkProviderLabel", () => {
  it("recognizes known providers", () => {
    expect(linkProviderLabel("https://www.youtube.com/watch?v=x")).toBe("YouTube");
    expect(linkProviderLabel("https://youtu.be/x")).toBe("YouTube");
    expect(linkProviderLabel("https://www.loom.com/share/x")).toBe("Loom");
    expect(linkProviderLabel("https://vimeo.com/x")).toBe("Vimeo");
    expect(linkProviderLabel("https://app.finne.io/x")).toBe("Finné");
  });

  it("falls back to the hostname for unknown providers", () => {
    expect(linkProviderLabel("https:// recordings.example.com /x".replace(/\s/g, ""))).toBe("recordings.example.com");
  });

  it("returns 'link' for an unparseable URL", () => {
    expect(linkProviderLabel("garbage")).toBe("link");
  });
});

describe("mime classification helpers", () => {
  it("isAllowedMime accepts documents + videos", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("text/markdown")).toBe(true);
    expect(isAllowedMime("video/mp4")).toBe(true);
    expect(isAllowedMime("application/x-msdownload")).toBe(false);
  });

  it("isVideoMime / isDocumentMime split the union", () => {
    expect(isVideoMime("video/mp4")).toBe(true);
    expect(isVideoMime("application/pdf")).toBe(false);
    expect(isDocumentMime("application/pdf")).toBe(true);
    expect(isDocumentMime("video/mp4")).toBe(false);
  });

  it("guessMimeFromFilename maps known extensions", () => {
    expect(guessMimeFromFilename("a.pdf")).toBe("application/pdf");
    expect(guessMimeFromFilename("clip.mp4")).toBe("video/mp4");
    expect(guessMimeFromFilename("clip.MOV")).toBe("video/quicktime");
    expect(guessMimeFromFilename("readme.md")).toBe("text/markdown");
    expect(guessMimeFromFilename("unknown.xyz")).toBe("application/octet-stream");
  });

  it("hasAllowedExtension checks the allow-list", () => {
    expect(hasAllowedExtension("a.pdf")).toBe(true);
    expect(hasAllowedExtension("clip.webm")).toBe(true);
    expect(hasAllowedExtension("a.exe")).toBe(false);
  });
});
