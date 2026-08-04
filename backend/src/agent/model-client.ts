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

   Self-hosted (P9/D7): the endpoint is an OpenAI-compatible HTTP URL on the
   internal Docker network — vLLM on an AWS GPU (prod) or Ollama on the build
   laptop (dev). No vendor key is ever read (FIN-102 asserts this at boot).

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
}

let _modelDigestCache: { model: string; id: string; digest: string } | null = null;

/** Model digest from config (FIN-100: pinned, recorded in docs/models.md). */
function modelDigest(): { model: string; id: string; digest: string } {
  if (_modelDigestCache) return _modelDigestCache;
  const env = loadEnv();
  _modelDigestCache = {
    model: env.model.name,
    id: env.model.name, // served-model id == name for vLLM/Ollama
    digest: env.model.digest ?? "unpinned",
  };
  return _modelDigestCache;
}

/**
 * Whether the model is enabled. When MODEL_BASE_URL is empty/unset/disabled, or
 * when NODE_ENV=test (no model is running in CI), the agent runs permanently in
 * degrade mode (the FIN-105 "models-unplugged" state). This is also what local
 * dev uses when no model container is up. CI proves the loop passes this way.
 */
export function isModelEnabled(): boolean {
  if (process.env.NODE_ENV === "test") return false; // FIN-105: CI runs models-unplugged
  const url = loadEnv().model.baseUrl.trim();
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
 * Call the model. OpenAI-compatible chat completions endpoint — works for both
 * vLLM and Ollama. 5s hard timeout, no retry. Always logs. Never throws: a
 * failure is a `degraded` result, and the caller degrades its station.
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
  const url = `${env.model.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.model.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.model.name, // config only — never a hardcoded model name
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        temperature: 0.2, // low — the clerk prepares and points; no creative leaps
        max_tokens: 400,
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
