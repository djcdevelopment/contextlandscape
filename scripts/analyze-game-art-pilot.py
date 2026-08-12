#!/usr/bin/env python3
"""Summarize Context Landscape game-art render and perception results."""

import argparse
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path


def mean(values: list[float]) -> float | None:
    return round(statistics.fmean(values), 4) if values else None


def median(values: list[float]) -> float | None:
    return round(statistics.median(values), 4) if values else None


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1))
    return round(ordered[index], 4)


def metric_summary(records: list[dict]) -> dict:
    seconds = [record["sidecar"]["metrics"].get("t_total_s") for record in records]
    seconds = [float(value) for value in seconds if value is not None]
    aesthetic = [record["score"].get("aesthetic") for record in records if record.get("score")]
    aesthetic = [float(value) for value in aesthetic if value is not None]
    clip = [record["score"].get("clip") for record in records if record.get("score")]
    clip = [float(value) for value in clip if value is not None]
    vlm_records = [record["score"]["vlm"] for record in records if (record.get("score") or {}).get("vlm")]
    defect_names = sorted({name for item in vlm_records for name in item.get("defects", {})})
    defect_counts = {name: sum(bool(item.get("defects", {}).get(name)) for item in vlm_records) for name in defect_names}
    return {
        "n": len(records),
        "scored": len(aesthetic),
        "vlmJudged": len(vlm_records),
        "renderSeconds": {"mean": mean(seconds), "median": median(seconds), "p95": percentile(seconds, 0.95)},
        "aesthetic": {"mean": mean(aesthetic), "median": median(aesthetic)},
        "clip": {"mean": mean(clip), "median": median(clip)},
        "vlm": {
            "craftMean": mean([float(item["craft"]) for item in vlm_records if item.get("craft") is not None]),
            "originalityMean": mean([float(item["originality"]) for item in vlm_records if item.get("originality") is not None]),
            "merchAppealMean": mean([float(item["merch_appeal"]) for item in vlm_records if item.get("merch_appeal") is not None]),
            "verdicts": dict(sorted(Counter(item.get("predicted_verdict", "unknown") for item in vlm_records).items())),
            "defectCounts": defect_counts,
            "defectRates": {name: round(count / len(vlm_records), 4) if vlm_records else None for name, count in defect_counts.items()},
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--scores-v2", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    jobs = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    scores = json.loads(args.scores_v2.read_text(encoding="utf-8")) if args.scores_v2 and args.scores_v2.is_file() else {}
    records: list[dict] = []
    missing: list[str] = []
    byte_total = 0

    for job in jobs:
        job_id = job["job_id"]
        required_paths = [
            args.results / "meta" / f"{job_id}.json",
            args.results / "img" / f"{job_id}.webp",
        ]
        optional_paths = [args.results / "thumb" / f"{job_id}.webp"]
        if not all(path.is_file() for path in required_paths):
            missing.append(job_id)
            continue
        sidecar = json.loads(required_paths[0].read_text(encoding="utf-8"))
        byte_total += sum(path.stat().st_size for path in required_paths + optional_paths if path.is_file())
        records.append({"job": job, "sidecar": sidecar, "score": scores.get(job_id)})

    groups: dict[str, dict[str, list[dict]]] = {
        key: defaultdict(list) for key in ("qualityLane", "artDirection", "subjectType", "subjectId", "endpoint")
    }
    for record in records:
        job = record["job"]
        groups["qualityLane"][job["qualityLane"]].append(record)
        groups["artDirection"][job["artDirection"]].append(record)
        groups["subjectType"][job["subjectType"]].append(record)
        groups["subjectId"][job["subjectId"]].append(record)
        groups["endpoint"][record["sidecar"]["metrics"].get("endpoint", "unknown")].append(record)

    pair_rows = []
    comparisons: dict[str, dict[str, dict]] = defaultdict(dict)
    for record in records:
        comparisons[record["job"]["comparisonId"]][record["job"]["qualityLane"]] = record
    for comparison_id, lanes in comparisons.items():
        if not {"q8", "bf16"}.issubset(lanes):
            continue
        q8_score = lanes["q8"].get("score") or {}
        bf16_score = lanes["bf16"].get("score") or {}
        pair_rows.append({
            "comparisonId": comparison_id,
            "subjectId": lanes["q8"]["job"]["subjectId"],
            "artDirection": lanes["q8"]["job"]["artDirection"],
            "renderSecondsDelta": round(lanes["bf16"]["sidecar"]["metrics"]["t_total_s"] - lanes["q8"]["sidecar"]["metrics"]["t_total_s"], 4),
            "aestheticDelta": round(bf16_score["aesthetic"] - q8_score["aesthetic"], 4) if bf16_score.get("aesthetic") is not None and q8_score.get("aesthetic") is not None else None,
            "clipDelta": round(bf16_score["clip"] - q8_score["clip"], 4) if bf16_score.get("clip") is not None and q8_score.get("clip") is not None else None,
        })

    report = {
        "schemaVersion": "context-landscape-game-art-analysis/v1",
        "campaign": jobs[0]["campaign"] if jobs else None,
        "manifestJobs": len(jobs),
        "completeJobs": len(records),
        "missingJobs": missing,
        "scoredJobs": sum(bool(record.get("score")) for record in records),
        "vlmJudgedJobs": sum(bool((record.get("score") or {}).get("vlm")) for record in records),
        "artifactBytes": byte_total,
        "overall": metric_summary(records),
        "groups": {
            group: {key: metric_summary(value) for key, value in sorted(values.items())}
            for group, values in groups.items()
        },
        "pairedQuality": {
            "n": len(pair_rows),
            "aestheticDeltaMeanBf16MinusQ8": mean([row["aestheticDelta"] for row in pair_rows if row["aestheticDelta"] is not None]),
            "clipDeltaMeanBf16MinusQ8": mean([row["clipDelta"] for row in pair_rows if row["clipDelta"] is not None]),
            "renderSecondsDeltaMeanBf16MinusQ8": mean([row["renderSecondsDelta"] for row in pair_rows]),
            "pairs": pair_rows,
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("manifestJobs", "completeJobs", "scoredJobs", "vlmJudgedJobs", "artifactBytes")}, indent=2))
    return 0 if len(records) == len(jobs) else 1


if __name__ == "__main__":
    raise SystemExit(main())
