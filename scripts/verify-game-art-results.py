#!/usr/bin/env python3
"""Verify that an AM4 render lane produced complete, provenance-preserving outputs."""

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--outdir", required=True, type=Path)
    args = parser.parse_args()

    jobs = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    problems: list[str] = []
    endpoint_counts: dict[str, int] = {}

    for job in jobs:
        job_id = job["job_id"]
        paths = {
            "image": args.outdir / "img" / f"{job_id}.webp",
            "thumbnail": args.outdir / "thumb" / f"{job_id}.webp",
            "sidecar": args.outdir / "meta" / f"{job_id}.json",
        }
        for kind, path in paths.items():
            if not path.is_file() or path.stat().st_size == 0:
                problems.append(f"{job_id}: missing {kind} {path}")
        if not paths["sidecar"].is_file():
            continue
        sidecar = json.loads(paths["sidecar"].read_text(encoding="utf-8"))
        for key in ("project", "campaign", "subjectType", "subjectId", "artDirection", "qualityLane", "comparisonId", "registryVersion", "sourceRefs"):
            if sidecar.get(key) != job.get(key):
                problems.append(f"{job_id}: sidecar mismatch for {key}")
        endpoint = sidecar.get("metrics", {}).get("endpoint")
        if not endpoint:
            problems.append(f"{job_id}: missing render endpoint")
        else:
            endpoint_counts[endpoint] = endpoint_counts.get(endpoint, 0) + 1

    report = {
        "status": "fail" if problems else "pass",
        "jobs": len(jobs),
        "complete": len(jobs) - len({problem.split(":", 1)[0] for problem in problems}),
        "endpointCounts": endpoint_counts,
        "problems": problems,
    }
    print(json.dumps(report, indent=2))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
