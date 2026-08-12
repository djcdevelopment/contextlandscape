#!/usr/bin/env bash
set -euo pipefail

comfy_root="${COMFY_ROOT:-/home/derek/ComfyUI}"
clip_file="$comfy_root/models/clip_vision/sigclip_vision_patch14_384.safetensors"
style_file="$comfy_root/models/style_models/flux1-redux-dev.safetensors"

mkdir -p "$(dirname "$clip_file")" "$(dirname "$style_file")"
curl -fL --retry 5 --retry-delay 3 --connect-timeout 20 -C - \
  -o "$clip_file" \
  "https://huggingface.co/Comfy-Org/sigclip_vision_384/resolve/main/sigclip_vision_patch14_384.safetensors"
curl -fL --retry 5 --retry-delay 3 --connect-timeout 20 -C - \
  -o "$style_file" \
  "https://huggingface.co/Comfy-Org/Flux1-Redux-Dev/resolve/main/flux1-redux-dev.safetensors"

printf '%s  %s\n' \
  "1fee501deabac72f0ed17610307d7131e3e9d1e838d0363aa3c2b97a6e03fb33" "$clip_file" \
  "a1b3bdcb4bdc58ce04874b9ca776d61fc3e914bb6beab41efb63e4e2694dca45" "$style_file" \
  | sha256sum --check --status

echo "Redux models installed and verified."
