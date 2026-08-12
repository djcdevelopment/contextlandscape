#!/usr/bin/env python3
"""Create a verified, compact archive of the v2 campaign without duplicating v1 parents."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-dir", default=Path("/home/derek/bench/context-landscape-founding-canon-v2"), type=Path)
    parser.add_argument("--bench-dir", default=Path("/home/derek/bench"), type=Path)
    parser.add_argument("--outdir", default=Path("/home/derek/bench/results_full"), type=Path)
    args = parser.parse_args()

    manifests = [args.campaign_dir / "manifest-calibration.jsonl", args.campaign_dir / "manifest-full.jsonl"]
    jobs = []
    for manifest in manifests:
        jobs.extend(json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip())
    jobs_by_id = {job["job_id"]: job for job in jobs}
    if len(jobs_by_id) != 115:
        raise RuntimeError(f"Expected 115 unique calibration + production jobs; found {len(jobs_by_id)}")

    relative_files = []
    inventory = []
    for job_id in sorted(jobs_by_id):
        record = {"jobId": job_id, "parentJobId": jobs_by_id[job_id]["parentJobId"], "files": {}}
        for kind, subdir in (("image", "img"), ("thumbnail", "thumb"), ("sidecar", "meta")):
            path = args.outdir / subdir / f"{job_id}.{'json' if subdir == 'meta' else 'webp'}"
            if not path.is_file() or path.stat().st_size == 0:
                raise FileNotFoundError(path)
            relative = path.relative_to(args.bench_dir)
            relative_files.append(str(relative))
            record["files"][kind] = {"path": str(relative), "bytes": path.stat().st_size, "sha256": sha256(path)}
        inventory.append(record)

    scores_path = args.outdir / "scores.json"
    scores = json.loads(scores_path.read_text(encoding="utf-8")) if scores_path.is_file() else {}
    score_subset = {job_id: scores[job_id] for job_id in jobs_by_id if job_id in scores}
    (args.campaign_dir / "scores.json").write_text(json.dumps(score_subset, separators=(",", ":")) + "\n", encoding="utf-8")
    (args.campaign_dir / "archive-inventory.json").write_text(json.dumps({
        "schemaVersion": "context-landscape-game-art-archive/v1",
        "jobs": len(inventory),
        "scored": len(score_subset),
        "parentImagesExcluded": True,
        "records": inventory
    }, indent=2) + "\n", encoding="utf-8")

    for name in (
        "manifest.json", "manifest-smoke.jsonl", "manifest-calibration.jsonl",
        "manifest-full.jsonl", "founding-canon-v1.json", "reference-inventory.json",
        "scores.json", "archive-inventory.json"
    ):
        path = args.campaign_dir / name
        if path.is_file():
            relative_files.append(str(path.relative_to(args.bench_dir)))

    filelist = args.campaign_dir / "archive-files.txt"
    relative_files.append(str(filelist.relative_to(args.bench_dir)))
    filelist.write_text("\n".join(sorted(set(relative_files))) + "\n", encoding="utf-8")
    archive = args.campaign_dir.with_suffix(".tar.zst")
    subprocess.run([
        "tar", "--zstd", "-C", str(args.bench_dir), "-cf", str(archive),
        "-T", str(filelist)
    ], check=True)
    archive_hash = sha256(archive)
    (archive.with_suffix(archive.suffix + ".sha256")).write_text(f"{archive_hash}  {archive.name}\n", encoding="utf-8")
    print(json.dumps({
        "status": "pass", "jobs": len(inventory), "scored": len(score_subset),
        "archive": str(archive), "bytes": archive.stat().st_size, "sha256": archive_hash
    }, indent=2))


if __name__ == "__main__":
    main()
