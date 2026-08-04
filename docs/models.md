# Model runtime — `docs/models.md` (FIN-100)

Where model inference runs in Finné, what it may produce, and what it may not.
This document is the pinned-model record required by PRD Addendum A §G and
FIN-100. It is read by the reviewer, the design partner, and anyone asking
"where does the data go?"

## The one-line posture

**Model inference runs on Finné-controlled machines with open weights. No case
content, evidence, terms, or party detail is sent to an external model API.**
This is principle P9 and decision D7, and it is asserted at boot (FIN-102): the
backend refuses to start if any external model vendor key is present.

## Runtime

The model is a self-hosted OpenAI-compatible HTTP endpoint. One URL, no vendor
key. Two profiles:

| Environment | Runtime | Hardware | Endpoint |
|---|---|---|---|
| **Dev (Mac)** | Ollama (native, Metal) | Apple Silicon | `http://host.docker.internal:11434/v1` |
| **Prod (AWS)** | vLLM in Docker (pre-baked image) | EC2 GPU (`g5.xlarge` L4 / `g6.xlarge`) | `http://model.finne.local:8000/v1` (private DNS) |

Both expose the same `/v1/chat/completions` interface, so the backend's model
client (`backend/src/agent/model-client.ts`, FIN-101) is identical across
environments — only the `MODEL_BASE_URL` differs in `.env`.

## The production model service (FinneModelStack)

In AWS, the model runs on a dedicated GPU EC2 instance provisioned by the
`FinneModelStack` (`infra/cdk/lib/model-stack.ts`):

- **Instance**: `g5.xlarge` (1× NVIDIA L4, 24GB VRAM) in a private subnet, no
  public IP. Ops access via SSM Session Manager (`aws ssm start-session`).
- **Runtime**: Ubuntu 24.04 + NVIDIA driver + Docker; vLLM served in a
  container with GPU passthrough on `:8000`.
- **DNS**: a Route53 private hosted zone maps `model.finne.local` to the
  instance private IP. The backend's `MODEL_BASE_URL` is set to
  `http://model.finne.local:8000/v1` — reachable only from the backend ECS
  task (security group: ingress :8000 from the backend SG only).
- **Swap**: change `MODEL_NAME` and redeploy. The instance user-data is marked
  `userDataCausesReplacement`, so CDK spins up a new instance with the new model.
- **Models-unplugged mode**: set `MODEL_DEPLOY=false` before deploying to skip
  the model stack entirely (`MODEL_BASE_URL=disabled`). The agent degrades to
  templates + computation (FIN-105, P8) — a fully working, honest state.
- **Cost**: ~$0.70–1.15/hr (g5.xlarge on-demand). Scale to zero / spot for
  lower-cost staging; accept the cold-start load delay.

See `infra/SECRETS.md` for the one-time AWS + GitHub-secrets setup, and
`.github/workflows/deploy.yml` for the auto-deploy pipeline.

## Pre-baked vLLM image (prod)

The prod gpu profile BUILDS `model/Dockerfile` rather than running the public
`vllm/vllm-openai` image directly. The weights are downloaded **once, at `docker
build` time** and layered into the image, so a fresh GPU box does not re-download
the model on first request — it goes straight to the VRAM load (~1–3 min). Build
with `./scripts/model-bake.sh` (or `docker compose --profile gpu up --build`).
The served model is fixed at build time via `MODEL_NAME`; see `model/README.md`.

## Pinned models

Per FIN-100, the served model is pulled once and pinned by digest. Any model
change is a config change plus a regression run (the swap rule, Addendum §G);
product code references no model names.

| Model | Licence | Use | Status |
|---|---|---|---|
| `Qwen/Qwen2.5-3B-Instruct` | qwen-research (custom) | **Default served model** (~3B, fits a single L4/A10G with headroom; faster cold-start than 7B). Sufficient for question phrasing + narrative. | Production default |
| `mistralai/Mistral-7B-Instruct-v0.3` | Apache 2.0 | Heavier alternative (more fluent narrative). Swap in by rebuilding the image with a different `MODEL_NAME`. | Optional swap |
| `gpt-oss-20b` | Apache 2.0 | PRD Addendum primary (text-only). Swap in on a bigger GPU (≥24GB VRAM, 4-bit quant) by changing `MODEL_NAME`. | Optional swap |
| `Mistral Small 4` | Apache 2.0 | Vision-capable alternative (when A2 document readers arrive). | Future |

> **Licence note (Qwen2.5-3B):** the default served model is under the
> `qwen-research` custom licence (not Apache/MIT). It permits commercial use
> with conditions; review the terms at the model card before redistribution.
> This licence choice is recorded here per FIN-100's pin policy. To revert to an
> Apache-2.0-only posture, rebuild the image with
> `mistralai/Mistral-7B-Instruct-v0.3` and set `MODEL_NAME` accordingly.

> **Note on digests:** pin the exact model digest in production by setting
> `MODEL_DIGEST`. For dev/demo, `MODEL_DIGEST` may be left unset (logged as
> `unpinned`).

> **Note on digests:** pin the exact model digest in production by setting
> `MODEL_DIGEST`. For dev/demo, `MODEL_DIGEST` may be left unset (logged as
> `unpinned`).

## What the model may produce

Per PRD Addendum A, the model's only jobs in this build are:

1. **Turning questions** (FIN-123) — phrase the questions the case turns on,
   from failed/contested checks, citing clauses. It poses questions; never
   answers them.
2. **Narrative summary** (FIN-104) — one paragraph summarising the dispute.

Everything else in the decision frame is **deterministic** — outcome
requirements come from authored templates (FIN-121), unresolved items are
computed from the record (FIN-122), checks are pure functions (FIN-113/114).

## What the model may NOT do

Enforced structurally, not by policy:

- **Render a verdict** — `validateDraftFrame()` + `validateNoVerdictKeys()`
  reject verdict/liability/fraud/score/confidence/ranking keys at any depth.
- **Name outcomes in its own voice** — the outcome-word post-filter (FIN-103)
  blocks `refund / reject / approve / release` in model-generated text.
- **Hold keys or sign** — no agent module imports signing code; the money-key
  boot-fail extends to agent modules.
- **Be required for the loop** — every model call has a 5s hard timeout and a
  defined degrade path (P8). CI proves the full demo loop passes with the model
  permanently unplugged (FIN-105).

## The unplugged guarantee

Run `vitest` in the backend: the suite runs entirely in models-unplugged mode
(`NODE_ENV=test` disables the model client). Every agent surface renders its
degraded state; the demo loop passes end to end. The agent saves time. It is
never the thing the case depends on.

## Operational notes (prod)

- **Cold start**: vLLM loads the baked-in weights into VRAM on first request
  (1–3 min). There is no model download — the weights are already in the image.
  The 5s timeout (P8) degrades the first call; keep the instance warm for
  demo/production traffic, or accept the loading delay. The compose healthcheck
  (`/v1/models`) marks the service healthy once serving.
- **Swap**: rebuild the image with the new `--build-arg MODEL_NAME=...`
  (`./scripts/model-bake.sh <model>`), set `MODEL_NAME` (+ `MODEL_DIGEST` when
  pinning) in `.env` to match, and re-run the frame regression
  (`backend/test/agent-unplugged.test.ts` + `frame-symmetry.test.ts`). No code
  change.
- **Corpus log**: every model call is recorded in `v1_ModelCall` (FIN-131) —
  input hash, model digest, output, validation result. Append-only.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MODEL_BASE_URL` | `http://model:8000/v1` | OpenAI-compatible endpoint. Empty/`disabled` = models-unplugged. |
| `MODEL_NAME` | `Qwen/Qwen2.5-3B-Instruct` | Served model name (config only — never in call sites). Must match the model baked into the image. |
| `MODEL_DIGEST` | unset | Pinned digest for reproducibility. |
| `MODEL_TIMEOUT_MS` | `5000` | Hard timeout per call (P8). |
