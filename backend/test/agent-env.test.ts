import { describe, it, expect } from "vitest";
import { assertNoExternalModelKeys } from "../src/env.ts";

/* FIN-102 — no external model API in any environment (P9, D7). The backend
   refuses to boot when a vendor model key is present. The self-hosted runtime
   (MODEL_BASE_URL) is a URL, not a key, so it never trips this. */

describe("FIN-102 no-external-model-key assertion", () => {
  it("allows a clean self-hosted env (MODEL_BASE_URL is a URL, not a key)", () => {
    expect(() =>
      assertNoExternalModelKeys({
        MODEL_BASE_URL: "http://model:8000/v1",
        MODEL_NAME: "Qwen/Qwen2.5-3B-Instruct",
        MODEL_TIMEOUT_MS: "5000",
      }),
    ).not.toThrow();
  });

  it("allows an empty env (models-unplugged mode)", () => {
    expect(() => assertNoExternalModelKeys({})).not.toThrow();
  });

  it.each([
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GROQ_API_KEY",
    "TOGETHER_API_KEY",
    "TOGETHERAI_API_KEY",
    "MISTRAL_API_KEY",
    "COHERE_API_KEY",
    "REPLICATE_API_TOKEN",
    "PERPLEXITY_API_KEY",
    "DEEPSEEK_API_KEY",
    "FIREWORKS_API_KEY",
    "ANYSCALE_API_KEY",
    "HF_TOKEN",
    "HUGGING_FACE_HUB_TOKEN",
  ])("fails on %s", (key) => {
    expect(() => assertNoExternalModelKeys({ [key]: "sk-test" })).toThrow(/external model API key/);
  });

  it("fails on AWS_BEDROCK_* keys (any prefix match)", () => {
    expect(() => assertNoExternalModelKeys({ AWS_BEDROCK_REGION: "us-east-1" })).toThrow(/external model API key/);
    expect(() => assertNoExternalModelKeys({ BEDROCK_ACCESS_KEY: "x" })).toThrow(/external model API key/);
  });

  it("does not match unrelated keys containing 'API'", () => {
    expect(() =>
      assertNoExternalModelKeys({ SOME_OTHER_API_CONFIG: "x", INTERNAL_TOKEN: "y" }),
    ).not.toThrow();
  });
});
