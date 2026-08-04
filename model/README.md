# Finné model runtime — pre-baked vLLM image

This directory builds a **self-contained Docker image with the model weights baked in**, so the
vLLM inference server starts fast on any GPU box — no multi-gigabyte download on first request.

See [`docs/models.md`](../docs/models.md) for the full model policy: what it may produce, what it
may never do, the swap rule, and the pinned-model record (FIN-100).

## Why a pre-baked image?

The public `vllm/vllm-openai:latest` image ships **without weights**. On a fresh box or a wiped
volume, vLLM downloads the model from HuggingFace on first request — that download (~7 GB for the
default Qwen2.5-3B, ~14 GB for a 7B) is the slow cold-start everyone hits.

This image downloads the weights **once, at `docker build` time** and layers them into the image.
After that, `docker run` goes straight to the VRAM load (~1–3 minutes) with no network download.
Build once on a box with good bandwidth; push the image; run it anywhere instantly.

## Requirements

- **NVIDIA GPU** — vLLM is CUDA-only. A single L4 / A10G (≥16 GB VRAM) is enough for the default
  3B model. vLLM **cannot run on Apple Silicon** (no CUDA); use the Ollama dev profile on a Mac.
- **Docker** with the NVIDIA Container Toolkit (`nvidia-docker`) installed on the host.
- **Disk**: the image is ~model-size + vLLM base (~10 GB total for Qwen2.5-3B).

## Build

From the repo root:

```bash
# Default model (Qwen2.5-3B-Instruct, the production default)
docker build -t finne-model:latest -f model/Dockerfile .

# Swap the model (FIN-100 swap rule: rebuild + note in docs/models.md)
docker build -t finne-model:latest -f model/Dockerfile \
  --build-arg MODEL_NAME=mistralai/Mistral-7B-Instruct-v0.3 .

# Gated model (needs a HuggingFace token)
docker build -t finne-model:latest -f model/Dockerfile \
  --build-arg MODEL_NAME=meta-llama/Llama-3.2-3B-Instruct \
  --build-arg HF_HUB_TOKEN=hf_xxx .
```

Or use the wrapper: `./scripts/model-bake.sh`.

The build downloads the weights once (the only slow step) and layers them into the image.

## Run

```bash
# Standalone
docker run --gpus all -p 8000:8000 finne-model:latest

# Via compose (the recommended path — wires up the backend + healthcheck)
docker compose --profile gpu up --build
```

vLLM exposes an OpenAI-compatible API at `http://localhost:8000/v1/chat/completions`. Health check:
`curl http://localhost:8000/v1/models`.

## Build-time vs run-time

| | When | What |
|---|---|---|
| **Build** | `docker build` (once) | Downloads weights from HuggingFace into the image. ~10–15 min on a fast link. |
| **Run** | `docker run` (every start) | Loads weights into VRAM. ~1–3 min, no network. |

The served model is fixed at build time via `MODEL_NAME`. To change it, rebuild with a different
`--build-arg` (not a run-time flag) — this keeps the image hermetic and reproducible.

## Swap rule (Addendum §G)

Changing the served model is a **config + rebuild**, not a code change:

1. Rebuild the image with `--build-arg MODEL_NAME=...`.
2. Update `MODEL_NAME` in `.env` to match.
3. Record the swap in [`docs/models.md`](../docs/models.md) (the pinned-model record, FIN-100).
4. Run the frame regression: `backend/test/frame-symmetry.test.ts` + `agent-unplugged.test.ts`.

The backend's model client (`backend/src/agent/model-client.ts`) references no model names — it
reads `MODEL_NAME` from config only (FIN-101), so no call-site edits are ever needed.
