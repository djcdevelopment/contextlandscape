#!/usr/bin/env bash
set -euo pipefail

campaign_dir="${CAMPAIGN_DIR:-/home/derek/bench/context-landscape-founding-canon-v2}"
bench_dir="${BENCH_DIR:-/home/derek/bench}"
outdir="${OUTDIR:-$bench_dir/results_full}"
production_unit="${PRODUCTION_UNIT:-context-landscape-v2-production.service}"
score_wait_cycles="${SCORE_WAIT_CYCLES:-720}"

restore_interactive_services() {
  docker start comfy-valheim-server-am4-valheim-server-1 comfy-steward-view >/dev/null 2>&1 || true
  sudo -n systemctl stop comfyui-b.service >/dev/null 2>&1 || true
}
trap restore_interactive_services EXIT

while systemctl --user is-active --quiet "$production_unit"; do
  sleep 30
done

python="$campaign_dir/verify-game-art-results.py"
"$python" --manifest "$campaign_dir/manifest-calibration.jsonl" --outdir "$outdir"
"$python" --manifest "$campaign_dir/manifest-full.jsonl" --outdir "$outdir"
bash /home/derek/gallery/refresh.sh

# Generation no longer needs the second card, so return AM4 to its interactive
# posture immediately. OMEN scoring and archive assembly continue independently.
restore_interactive_services
trap - EXIT

for ((cycle=1; cycle<=score_wait_cycles; cycle++)); do
  scored="$(python3 - "$campaign_dir" "$outdir" <<'PY'
import json, sys
from pathlib import Path
campaign, outdir = map(Path, sys.argv[1:])
ids = set()
for name in ('manifest-calibration.jsonl', 'manifest-full.jsonl'):
    ids.update(json.loads(line)['job_id'] for line in (campaign / name).read_text().splitlines() if line.strip())
scores = json.loads((outdir / 'scores.json').read_text()) if (outdir / 'scores.json').is_file() else {}
print(sum(job_id in scores for job_id in ids))
PY
)"
  echo "scored $scored / 115"
  if [[ "$scored" -eq 115 ]]; then
    break
  fi
  sleep 30
done

python3 "$campaign_dir/archive-game-art-founding-canon-v2-am4.py"
bash /home/derek/gallery/refresh.sh
