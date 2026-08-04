/* ============================================================================
   FIN-101 — the shared model client. ONE module. Every agent call site uses
   this. No model names in call sites (config only) — the swap rule (Addendum
   §G) makes a model change a config change, not a code change.

   Contract (P8 — degrade to v1):
     - 5s hard timeout per call (AbortController)
     - single retry OFF
     - on any failure (timeout, HTTP error, malformed output) the call returns
       a `degraded` result. The caller's station degrades silently to v1
       behaviour. The agent saves time; the loop never depends on it.

   Provider dispatch (MODEL_PROVIDER):
     - "openai-compatible" (default): self-hosted open weights (P9/D7). The
       endpoint is an OpenAI-compatible HTTP URL on the internal Docker network
       — vLLM on an AWS GPU (prod) or Ollama on the build laptop (dev). No
       vendor key is ever read (FIN-102 asserts this at boot).
     - "bedrock" (HACKATHON EXCEPTION): a hosted external model service (AWS
       Bedrock). This deviates from P9/D7 — case content IS sent to an external
       model API. It is gated by assertBedrockHackathonOptIn (env.ts), which
       refuses to boot unless MODEL_BEDROCK_HACKATHON_OPT_IN=true. Bedrock
       authenticates via IAM (AWS_PROFILE / AWS_ACCESS_KEY_ID + SECRET), NOT an
       API key. The SDK is imported lazily so the openai-compatible path never
       pays for it and never breaks if it is absent.

   Both paths honour the same P8 contract: a 5s hard timeout and a `degraded`
   result on any failure. The caller never knows which provider ran.

   Corpus logging (FIN-131): every call is recorded to v1_ModelCall — input
   hash, model digest, output, validation result. Append-only. The audit trail
   now; the labelled set for fine-tuning later.
   ========================================================================== */

import mongoose from "mongoose";
import { generateId } from "@finne/domain";
import { canonicalHash } from "../canonical.ts";
import { loadEnv } from "../env.ts";
import { ModelCall, FrameAction } from "../v1/models.ts";

/** Result of a model call. `degraded:true` means use v1 behaviour (P8). */
export interface CompletionResult {
  text: string | null; // null when degraded
  degraded: boolean;
  reason?: "timeout" | "http_error" | "malformed" | "disabled";
  /** The corpus-log row id (always set, even on degrade — failures are logged). */
  callId: string;
}

export interface CompleteInput {
  /** Stable task label, e.g. "frame.turning_questions". Indexed for replay. */
  task: string;
  system: string;
  prompt: string;
  /** Override the default 400-token output cap (e.g. longer summaries). */
  maxTokens?: number;
}

let _modelDigestCache: { model: string; id: string; digest: string } | null = null;

/** Model digest from config (FIN-100: pinned, recorded in docs/models.md). */
export function modelDigest(): { model: string; id: string; digest: string } {
  if (_modelDigestCache) return _modelDigestCache;
  const env = loadEnv();
  _modelDigestCache = {
    model: env.model.name,
    // served-model id == name for vLLM/Ollama/Bedrock (the configured model id)
    id: env.model.name,
    digest: env.model.digest ?? "unpinned",
  };
  return _modelDigestCache;
}

/**
 * Whether the model is enabled. When MODEL_BASE_URL is empty/unset/disabled, or
 * when NODE_ENV=test (no model is running in CI), the agent runs permanently in
 * degrade mode (the FIN-105 "models-unplugged" state). This is also what local
 * dev uses when no model container is up. CI proves the loop passes this way.
 *
 * Provider-aware:
 *  - bedrock: enabled iff a model id is configured (MODEL_NAME).
 *  - openai-compatible: enabled iff MODEL_BASE_URL is a real endpoint.
 */
export function isModelEnabled(): boolean {
  if (process.env.NODE_ENV === "test") return false; // FIN-105: CI runs models-unplugged
  const env = loadEnv();
  if (env.model.provider === "bedrock") {
    return env.model.name.trim().length > 0;
  }
  const url = env.model.baseUrl.trim();
  return url.length > 0 && url !== "disabled";
}

/**
 * Whether the corpus log can be written right now. When Mongo is disconnected
 * (unit tests, or boot before connectDb), mongoose buffers writes indefinitely
 * — which would hang the degrade path. Skip the write then; the callId is still
 * returned so callers can proceed. Logging is best-effort by design (P8).
 */
function canLog(): boolean {
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  return mongoose.connection.readyState === 1;
}

/** Log a call to the corpus (FIN-131). Never throws — logging is best-effort. */
async function logCall(params: {
  task: string;
  input: { system: string; prompt: string };
  output: string | null;
  validation: ModelCallValidation;
}): Promise<string> {
  const callId = generateId("modelcall");
  if (!canLog()) return callId; // no DB — skip the write, keep the loop moving
  try {
    const inputHash = canonicalHash(params.input);
    await ModelCall.create({
      callId,
      task: params.task,
      modelDigest: modelDigest(),
      inputHash,
      output: params.output,
      validation: params.validation,
      humanActionRef: null, // filled later when the reviewer acts on a frame line
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    // Logging must never break the loop (P8). The agent degrades; the corpus
    // row is simply absent for this call.
    console.warn("[model-client] corpus log failed (continuing):", e instanceof Error ? e.message : e);
  }
  return callId;
}

type ModelCallValidation = "ok" | "degraded" | "blocked_by_filter" | "parse_failed" | "timeout" | "error";

/**
 * Call the model. Dispatches to the configured provider. 5s hard timeout, no
 * retry. Always logs. Never throws: a failure is a `degraded` result, and the
 * caller degrades its station.
 */
export async function complete(input: CompleteInput): Promise<CompletionResult> {
  if (!isModelEnabled()) {
    const callId = await logCall({
      task: input.task,
      input: { system: input.system, prompt: input.prompt },
      output: null,
      validation: "degraded",
    });
    return { text: null, degraded: true, reason: "disabled", callId };
  }

  const env = loadEnv();
  return env.model.provider === "bedrock"
    ? completeBedrock(input, env.model.timeoutMs, env.model.awsRegion, input.maxTokens)
    : completeOpenAICompatible(input, env.model.baseUrl, env.model.timeoutMs, input.maxTokens);
}

/* ============================================================================
   OpenAI-compatible provider (self-hosted open weights, P9/D7). The original
   path — byte-for-byte the same behaviour. POST to {baseUrl}/chat/completions.
   ========================================================================== */

async function completeOpenAICompatible(
  input: CompleteInput,
  baseUrl: string,
  timeoutMs: number,
  maxTokens?: number,
): Promise<CompletionResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: loadEnv().model.name, // config only — never a hardcoded model name
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        temperature: 0.2, // low — the clerk prepares and points; no creative leaps
        max_tokens: maxTokens ?? 400,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const callId = await logCall({
        task: input.task,
        input: { system: input.system, prompt: input.prompt },
        output: null,
        validation: "error",
      });
      console.warn(`[model-client] HTTP ${res.status} on ${input.task} — degrading`);
      return { text: null, degraded: true, reason: "http_error", callId };
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? null;
    if (!text) {
      const callId = await logCall({
        task: input.task,
        input: { system: input.system, prompt: input.prompt },
        output: null,
        validation: "parse_failed",
      });
      return { text: null, degraded: true, reason: "malformed", callId };
    }

    const callId = await logCall({
      task: input.task,
      input: { system: input.system, prompt: input.prompt },
      output: text,
      validation: "ok",
    });
    return { text, degraded: false, callId };
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message));
    const callId = await logCall({
      task: input.task,
      input: { system: input.system, prompt: input.prompt },
      output: null,
      validation: aborted ? "timeout" : "error",
    });
    console.warn(`[model-client] ${aborted ? "timeout" : "error"} on ${input.task} — degrading`);
    return {
      text: null,
      degraded: true,
      reason: aborted ? "timeout" : "http_error",
      callId,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================================
   Bedrock provider (HACKATHON EXCEPTION — hosted external model, deviates from
   P9/D7; gated by assertBedrockHackathonOptIn at boot). Uses the AWS SDK's
   Converse API with the SAME generation params (temperature 0.2, maxTokens 400)
   and the SAME 5s hard timeout (P8). Authenticates via the standard AWS SDK
   credential chain (AWS_PROFILE / AWS_ACCESS_KEY_ID + SECRET + region) — NOT an
   API key, which is why FIN-102's forbidden-key list (AWS_BEDROCK_*) is never
   tripped by this path. The SDK is imported lazily.

   The client is constructed once and cached; the degrade contract is identical
   to the openai-compatible path: any failure (timeout, SDK error, empty text)
   returns a `degraded` result and the caller degrades its station (P8).
   ========================================================================== */

// Cache the lazily-imported client so repeat calls reuse one TCP/TLS connection.
// Type-only import — no runtime cost, keeps the SDK out of the openai-compatible
// + test paths (which never construct a client).
type BedrockRuntimeClient = import("@aws-sdk/client-bedrock-runtime").BedrockRuntimeClient;
let _bedrockClient: { client: BedrockRuntimeClient; region: string } | null = null;

async function getBedrockClient(region: string | null): Promise<BedrockRuntimeClient> {
  if (_bedrockClient && _bedrockClient.region === region) return _bedrockClient.client;
  if (!region) {
    // Should be unreachable — assertBedrockHackathonOptIn blocks boot without a
    // region — but keep the P8 contract: degrade rather than crash.
    throw new Error("AWS_REGION not configured for Bedrock provider");
  }
  // Lazy import: keeps the SDK out of the openai-compatible + test paths.
  const { BedrockRuntimeClient } = await import("@aws-sdk/client-bedrock-runtime");
  const client = new BedrockRuntimeClient({ region });
  _bedrockClient = { client, region };
  return client;
}

async function completeBedrock(
  input: CompleteInput,
  timeoutMs: number,
  region: string | null,
  maxTokens?: number,
): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = await getBedrockClient(region);
    const modelName = loadEnv().model.name; // config only — never a hardcoded model name

    // Converse API shape. System prompt is a top-level field (not a message),
    // and content blocks are arrays of { text }. inferenceConfig mirrors the
    // openai-compatible params (temperature 0.2, maxTokens). The AbortSignal
    // is passed to client.send so the SDK tears down the HTTP request on the
    // P8 timeout — the authoritative contract, no manual race needed.
    const cmd = new ConverseCommand({
      modelId: modelName,
      system: [{ text: input.system }],
      messages: [{ role: "user", content: [{ text: input.prompt }] }],
      inferenceConfig: {
        temperature: 0.2, // low — the clerk prepares and points; no creative leaps
        maxTokens: maxTokens ?? 400,
      },
    });

    const response = (await client.send(cmd, { abortSignal: controller.signal })) as {
      output?: { message?: { content?: Array<{ text?: string }> } };
    };

    const text =
      response.output?.message?.content?.map((c) => c.text ?? "").join("").trim() ?? null;
    if (!text) {
      const callId = await logCall({
        task: input.task,
        input: { system: input.system, prompt: input.prompt },
        output: null,
        validation: "parse_failed",
      });
      return { text: null, degraded: true, reason: "malformed", callId };
    }

    const callId = await logCall({
      task: input.task,
      input: { system: input.system, prompt: input.prompt },
      output: text,
      validation: "ok",
    });
    return { text, degraded: false, callId };
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message));
    const callId = await logCall({
      task: input.task,
      input: { system: input.system, prompt: input.prompt },
      output: null,
      validation: aborted ? "timeout" : "error",
    });
    console.warn(
      `[model-client] ${aborted ? "timeout" : "bedrock error"} on ${input.task} — degrading:`,
      e instanceof Error ? e.message : e,
    );
    return {
      text: null,
      degraded: true,
      reason: aborted ? "timeout" : "http_error",
      callId,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attach the reviewer's eventual action to a logged call (FIN-127). For an edit,
 * the edited text is stored ALONGSIDE the original in a separate FrameAction row
 * (the corpus). Best-effort; never throws.
 */
export async function recordHumanAction(
  callId: string,
  action: string,
  detail?: {
    caseId?: string;
    lineId?: string;
    originalText?: string;
    editedText?: string;
    provenance?: "template" | "computed" | "model";
  },
): Promise<void> {
  if (!canLog()) return;
  try {
    // 1. Stamp the model call with the action reference (the existing field).
    await ModelCall.updateOne({ callId }, { $set: { humanActionRef: action } });

    // 2. Write a per-line FrameAction row — for "edit", edited text sits next to
    //    the original (FIN-127 acceptance: "edited text stored alongside the
    //    original line"). Provenance is logged so corpus analysis can split
    //    model-origin edits from template-origin.
    if (detail?.caseId && detail?.lineId) {
      await FrameAction.create({
        actionId: generateId("faction"),
        caseId: detail.caseId,
        callId,
        lineId: detail.lineId,
        action,
        provenance: detail.provenance ?? "model",
        originalText: detail.originalText ?? "",
        editedText: action === "edit" ? (detail.editedText ?? "") : null,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn("[model-client] recordHumanAction failed:", e instanceof Error ? e.message : e);
  }
}
