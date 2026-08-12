#!/usr/bin/env bash
set -euo pipefail

lane="${1:?usage: run-game-art-founding-canon-v2-am4.sh smoke|calibration|full}"
campaign_dir="${CAMPAIGN_DIR:-/home/derek/bench/context-landscape-founding-canon-v2}"
bench_dir="${BENCH_DIR:-/home/derek/bench}"
outdir="${OUTDIR:-$bench_dir/results_full}"
python="${COMFY_PYTHON:-/home/derek/ComfyUI/.venv/bin/python}"

case "$lane" in
  smoke)
    manifest="$campaign_dir/manifest-smoke.jsonl"
    runner_args=(--alternate)
    ;;
  calibration)
    manifest="$campaign_dir/manifest-calibration.jsonl"
    runner_args=(--alternate)
    ;;
  full)
    manifest="$campaign_dir/manifest-full.jsonl"
    runner_args=(--governed --hot 92 --cool 82)
    ;;
  *) echo "unknown lane: $lane" >&2; exit 2 ;;
esac

cd "$bench_dir"
exec "$python" runner.py \
  --manifest "$manifest" \
  --outdir "$outdir" \
  --endpoints "http://127.0.0.1:8188,http://127.0.0.1:8189" \
  --timeout 600 \
  "${runner_args[@]}"
