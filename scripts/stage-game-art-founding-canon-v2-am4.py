#!/usr/bin/env python3
"""Stage the immutable v1 parent images into ComfyUI's input tree."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--canon", required=True, type=Path)
    parser.add_argument("--results", default=Path("/home/derek/bench/results_full"), type=Path)
    parser.add_argument("--comfy-input", default=Path("/home/derek/ComfyUI/input"), type=Path)
    parser.add_argument("--inventory", required=True, type=Path)
    args = parser.parse_args()

    canon = json.loads(args.canon.read_text(encoding="utf-8"))
    destination_root = args.comfy_input.resolve()
    destination_root.mkdir(parents=True, exist_ok=True)
    records = []
    for image in canon["images"]:
        image_id = image["id"]
        if not re.fullmatch(r"clga_[0-9a-f]{16}", image_id):
            raise ValueError(f"Unsafe image id: {image_id}")
        source = (args.results / image["sourceImage"]).resolve()
        destination = (destination_root / f"cl-canon-v1-{image_id}.webp").resolve()
        if destination.parent != destination_root:
            raise ValueError(f"Destination escaped input root: {destination}")
        if not source.is_file():
            raise FileNotFoundError(source)
        shutil.copy2(source, destination)
        records.append({
            "rank": image["rank"],
            "id": image_id,
            "source": str(source),
            "destination": str(destination),
            "bytes": destination.stat().st_size,
            "sha256": sha256(destination)
        })

    args.inventory.write_text(json.dumps({
        "schemaVersion": "context-landscape-reference-inventory/v1",
        "count": len(records),
        "records": records
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", "staged": len(records), "destination": str(destination_root)}))


if __name__ == "__main__":
    main()
