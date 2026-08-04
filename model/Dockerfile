# =============================================================================
# Finné model runtime — pre-baked vLLM image (FIN-100, PRD Addendum A).
#
# Why this exists: the public `vllm/vllm-openai:latest` image ships WITHOUT
# model weights, so vLLM downloads them from HuggingFace on first request —
# that ~7 GB download (longer for larger models) is the slow cold-start.
# This Dockerfile bakes the weights INTO the image at build time, so
# `docker run` goes straight to the VRAM load (~1–3 min) with no network
# download. Build once on a box with good bandwidth; run anywhere.
#
# Build (from repo root):
#   docker build -t finne-model:latest -f model/Dockerfile \
#     --build-arg MODEL_NAME=Qwen/Qwen2.5-3B-Instruct .
#
#   # or use the wrapper:
#   ./scripts/model-bake.sh
#
# Run (NVIDIA GPU required — vLLM is CUDA-only):
#   docker run --gpus all -p 8000:8000 finne-model:latest
#
# The served model is baked at build time via MODEL_NAME; to swap, rebuild
# with a different --build-arg (the FIN-100 swap rule: model change is a
# config change + a docs/models.md regression note, never a call-site edit).
# =============================================================================

# Pin a vLLM version rather than :latest so builds are reproducible. Bump
# deliberately (record in docs/models.md) when adopting a new vLLM release.
FROM vllm/vllm-openai:v0.7.3

# The model to bake in. Override at build time to swap (Addendum §G swap rule).
# Default is the Finné production default (see docs/models.md).
ARG MODEL_NAME=Qwen/Qwen2.5-3B-Instruct
# Optional: only needed for gated models. Qwen2.5-3B is public, so usually empty.
ARG HF_HUB_TOKEN=""

# Where the weights land inside the image. vLLM serves from this path.
ENV MODEL_NAME=${MODEL_NAME}
# Bake the resolved name into the cache path so vLLM finds it without a re-download.
ENV HF_HOME=/root/.cache/huggingface
ENV VLLM_MODEL=/models/${MODEL_NAME}

USER root

# ── Bake the weights into the image at BUILD time ─────────────────────────
# huggingface-cli is already installed in the vLLM image. Download to a fixed
# path so the entrypoint can serve it directly. This is the one slow step —
# it happens once, during `docker build`, not on every container start.
RUN mkdir -p "${VLLM_MODEL}" && \
    huggingface-cli download "${MODEL_NAME}" \
      --local-dir "${VLLM_MODEL}" \
      ${HF_HUB_TOKEN:+--token "${HF_HUB_TOKEN}"} && \
    echo "Baked ${MODEL_NAME} into ${VLLM_MODEL}"

# ── Serve ─────────────────────────────────────────────────────────────────
# vLLM exposes an OpenAI-compatible /v1/chat/completions endpoint. The backend
# model client (backend/src/agent/model-client.ts) is identical across runtimes
# — only MODEL_BASE_URL differs in .env.
EXPOSE 8000

# Serve the baked-in model path. Because the JSON exec form cannot interpolate
# build args, we read VLLM_MODEL (set above from MODEL_NAME) in a shell form
# entrypoint. max-model-len is conservative for VRAM headroom on a single
# L4/A10G; override at run time if the model + GPU allow more context.
ENTRYPOINT vllm serve "$VLLM_MODEL"
CMD ["--port", "8000", "--max-model-len", "4096"]
