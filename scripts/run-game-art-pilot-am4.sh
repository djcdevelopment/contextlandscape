#!/usr/bin/env bash
set -uo pipefail

lane="${1:?usage: run-game-art-pilot-am4.sh q8|bf16}"
pilot_dir="${PILOT_DIR:-/home/derek/bench/context-landscape-pilot}"
bench_dir="${BENCH_DIR:-/home/derek/bench}"
outdir="${OUTDIR:-$bench_dir/results_full}"
python="${COMFY_PYTHON:-/home/derek/ComfyUI/.venv/bin/python}"

case "$lane" in
  q8)
    manifest="$pilot_dir/manifest-q8.jsonl"
    endpoints="http://127.0.0.1:8188,http://127.0.0.1:8189"
    runner_args=(--governed --hot 90 --cool 80)
    ;;
  bf16)
    manifest="$pilot_dir/manifest-bf16.jsonl"
    endpoints="http://127.0.0.1:8188"
    runner_args=(--timeout 900 --cooldown 10)
    ;;
  *)
    echo "unknown lane: $lane" >&2
    exit 2
    ;;
esac

runner_pid=""
guard_pid=""
cleanup() {
  if [[ -n "$guard_pid" ]]; then
    kill "$guard_pid" 2>/dev/null || true
    wait "$guard_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$bench_dir" || exit 1
"$python" runner.py \
  --manifest "$manifest" \
  --outdir "$outdir" \
  --endpoints "$endpoints" \
  "${runner_args[@]}" &
runner_pid=$!
bash watchdog.sh > "$pilot_dir/${lane}-watchdog.log" 2>&1 &
guard_pid=$!

wait "$runner_pid"
runner_status=$?
cleanup
guard_pid=""
if [[ "$runner_status" -ne 0 ]]; then
  exit "$runner_status"
fi

exec "$python" "$pilot_dir/verify-game-art-results.py" --manifest "$manifest" --outdir "$outdir"
