#!/usr/bin/env bash
# =============================================================================
# model-bake.sh — build the pre-baked vLLM model image (FIN-100).
#
# Downloads the model weights INTO the image at build time, so vLLM starts fast
# on any GPU box (no multi-GB download on first request). See model/README.md.
#
# Usage:
#   ./scripts/model-bake.sh                                  # default model
#   ./scripts/model-bake.sh mistralai/Mistral-7B-Instruct-v0.3   # swap model
#   ./scripts/model-bake.sh Qwen/Qwen2.5-3B-Instruct hf_xxx # gated model + token
#
# Requirements: Docker with the NVIDIA Container Toolkit (build can run anywhere;
# running the image needs an NVIDIA GPU — vLLM is CUDA-only).
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODEL_NAME="${1:-Qwen/Qwen2.5-3B-Instruct}"
HF_HUB_TOKEN="${2:-}"
TAG="finne-model:latest"

echo "==> Baking vLLM model image"
echo "    model : ${MODEL_NAME}"
echo "    tag   : ${TAG}"
[ -n "$HF_HUB_TOKEN" ] && echo "    token : (set)" || echo "    token : (none — public model)"
echo ""

BUILD_ARGS=(--build-arg "MODEL_NAME=${MODEL_NAME}")
[ -n "$HF_HUB_TOKEN" ] && BUILD_ARGS+=(--build-arg "HF_HUB_TOKEN=${HF_HUB_TOKEN}")

# shellcheck disable=SC2086
docker build -t "${TAG}" -f model/Dockerfile "${BUILD_ARGS[@]}" .

echo ""
echo "==> Done. Image: ${TAG}"
echo "    Run:  docker run --gpus all -p 8000:8000 ${TAG}"
echo "    Or:   docker compose --profile gpu up"
echo ""
echo "    If you swapped the model, update MODEL_NAME in .env to match and"
echo "    record the swap in docs/models.md (FIN-100 swap rule)."
