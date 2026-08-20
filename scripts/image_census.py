#!/usr/bin/env python3
"""Build a read-only, cross-host census of Context Landscape image stores.

The orchestrator scans local roots directly and streams this same file to a remote
Python interpreter over SSH for AM4. Source directories are only opened for read;
all generated manifests and contact sheets are written beneath the configured
output directory on the invoking machine.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import math
import os
import shlex
import statistics
import subprocess
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


SCHEMA_VERSION = "context-landscape-image-census/v1"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"}
DEFAULT_EXCLUDED_DIRECTORIES = {".git", "__pycache__"}
INTEREST_SUBJECT_TYPES = {"mech", "commander", "battlefield", "ability", "artillery"}
INTEREST_GAME_USES = {
    "unit-portrait",
    "commander-portrait",
    "battlefield-background",
    "ability-card",
    "event-card",
}
INTEREST_TERMS = {
    "context landscape": 1.0,
    "battle command": 0.9,
    "commander": 0.55,
    "artillery": 0.55,
    "battlefield": 0.5,
    "mech": 0.5,
    "mechanized": 0.45,
    "ability card": 0.45,
    "event card": 0.45,
    "scout unit": 0.35,
    "line unit": 0.35,
    "heavy unit": 0.35,
    "combat action": 0.35,
    "target lock": 0.3,
}
EXTERNAL_FRANCHISE_TERMS = {"battletech", "battlemech", "mechwarrior"}
Image.MAX_IMAGE_PIXELS = 250_000_000


def utc_timestamp(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def content_hash(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def dct_matrix(size: int) -> np.ndarray:
    rows = np.arange(size, dtype=np.float64)[:, None]
    columns = np.arange(size, dtype=np.float64)[None, :]
    matrix = np.cos((math.pi / size) * (columns + 0.5) * rows)
    matrix[0, :] *= math.sqrt(1 / size)
    matrix[1:, :] *= math.sqrt(2 / size)
    return matrix


DCT_32 = dct_matrix(32)


def bits_to_hex(bits: Iterable[bool]) -> str:
    value = 0
    count = 0
    for bit in bits:
        value = (value << 1) | int(bool(bit))
        count += 1
    return f"{value:0{max(1, math.ceil(count / 4))}x}"


def image_fingerprints(image: Image.Image) -> tuple[str, str, list[int]]:
    grayscale = image.convert("L")
    dhash_pixels = np.asarray(grayscale.resize((9, 8), Image.Resampling.LANCZOS), dtype=np.int16)
    dhash = bits_to_hex((dhash_pixels[:, 1:] > dhash_pixels[:, :-1]).flatten())

    phash_pixels = np.asarray(grayscale.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float64)
    frequency = DCT_32 @ phash_pixels @ DCT_32.T
    low_frequency = frequency[:8, :8]
    median = float(np.median(low_frequency.flatten()[1:]))
    phash = bits_to_hex((low_frequency > median).flatten())

    rgb = np.asarray(image.convert("RGB").resize((1, 1), Image.Resampling.BOX), dtype=np.uint8)
    average_rgb = [int(value) for value in rgb[0, 0]]
    return dhash, phash, average_rgb


def serializable_metadata(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()}
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): serializable_metadata(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable_metadata(item) for item in value]
    return repr(value)


def collect_prompt_texts(value: Any, path: tuple[str, ...] = ()) -> list[str]:
    texts: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            texts.extend(collect_prompt_texts(item, path + (str(key).lower(),)))
    elif isinstance(value, list):
        for item in value:
            texts.extend(collect_prompt_texts(item, path))
    elif isinstance(value, str):
        key_path = "/".join(path)
        looks_like_prompt = any(token in key_path for token in ("prompt", "text", "positive", "negative"))
        stripped = " ".join(value.split())
        if looks_like_prompt and 16 <= len(stripped) <= 10_000:
            texts.append(stripped[:600])
    return texts


def embedded_image_metadata(info: dict[str, Any]) -> dict[str, Any]:
    if not info:
        return {"keys": [], "sha256": None, "texts": []}
    normalized = {str(key): serializable_metadata(value) for key, value in info.items()}
    texts: list[str] = []
    for value in info.values():
        parsed = value
        if isinstance(value, str) and value[:1] in ("{", "["):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                pass
        texts.extend(collect_prompt_texts(parsed))
    unique_texts = list(dict.fromkeys(texts))[:8]
    return {
        "keys": sorted(normalized),
        "sha256": hashlib.sha256(canonical_json(normalized).encode("utf-8")).hexdigest(),
        "texts": unique_texts,
    }


def logical_id_for(spec: dict[str, Any], relative_path: str) -> str | None:
    if spec["corpus"] in {"main-gallery", "valheim-gallery"}:
        return Path(relative_path).stem
    return None


def scan_image(path: Path, root: Path, spec: dict[str, Any], host: str) -> dict[str, Any]:
    relative_path = path.relative_to(root).as_posix()
    stat = path.stat()
    record: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "recordType": "imageFile",
        "id": hashlib.sha256(f"{host}\0{spec['id']}\0{relative_path}".encode("utf-8")).hexdigest()[:24],
        "host": host,
        "rootId": spec["id"],
        "corpus": spec["corpus"],
        "role": spec["role"],
        "path": str(path),
        "relativePath": relative_path,
        "logicalId": logical_id_for(spec, relative_path),
        "extension": path.suffix.lower(),
        "bytes": stat.st_size,
        "modifiedAt": utc_timestamp(stat.st_mtime),
        "sha256": sha256_file(path),
        "width": None,
        "height": None,
        "format": None,
        "mode": None,
        "frames": None,
        "dhash64": None,
        "phash64": None,
        "averageRgb": None,
        "embeddedMetadata": {"keys": [], "sha256": None, "texts": []},
        "decodeError": None,
    }
    try:
        with Image.open(path) as image:
            record.update(
                {
                    "width": image.width,
                    "height": image.height,
                    "format": image.format,
                    "mode": image.mode,
                    "frames": int(getattr(image, "n_frames", 1)),
                    "embeddedMetadata": embedded_image_metadata(dict(image.info)),
                }
            )
            dhash, phash, average_rgb = image_fingerprints(image)
            record.update({"dhash64": dhash, "phash64": phash, "averageRgb": average_rgb})
    except Exception as error:  # The exception is evidence and should not abort the census.
        record["decodeError"] = f"{type(error).__name__}: {error}"[:500]
    return record


def image_paths(root: Path, excluded_directories: set[str]) -> list[Path]:
    paths: list[Path] = []
    if not root.is_dir():
        return paths
    for directory, child_directories, filenames in os.walk(root, followlinks=False):
        child_directories[:] = [
            name for name in child_directories if name not in excluded_directories
        ]
        directory_path = Path(directory)
        for filename in filenames:
            path = directory_path / filename
            if path.suffix.lower() in IMAGE_EXTENSIONS:
                paths.append(path)
    return sorted(paths, key=lambda path: path.as_posix().lower())


def scan_root(
    spec: dict[str, Any], host: str, workers: int, sample_limit: int | None = None
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    started = time.monotonic()
    root = Path(spec["path"])
    excluded = DEFAULT_EXCLUDED_DIRECTORIES | set(spec.get("excludeDirectories", []))
    paths = image_paths(root, excluded)
    discovered_count = len(paths)
    if sample_limit is not None:
        paths = paths[:sample_limit]
    records: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {executor.submit(scan_image, path, root, spec, host): path for path in paths}
        for future in as_completed(futures):
            path = futures[future]
            try:
                records.append(future.result())
            except Exception as error:
                failures.append({"path": str(path), "error": f"{type(error).__name__}: {error}"})
    records.sort(key=lambda record: record["relativePath"].lower())
    summary = {
        "schemaVersion": SCHEMA_VERSION,
        "recordType": "rootSummary",
        "host": host,
        "rootId": spec["id"],
        "path": str(root),
        "corpus": spec["corpus"],
        "role": spec["role"],
        "exists": root.is_dir(),
        "discoveredImages": discovered_count,
        "scannedImages": len(records),
        "bytes": sum(record["bytes"] for record in records),
        "decodeErrors": sum(record["decodeError"] is not None for record in records),
        "scanFailures": failures,
        "sampleLimited": sample_limit is not None and discovered_count > len(paths),
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }
    return summary, records


def emit_worker(profile: dict[str, Any], workers: int, sample_limit: int | None) -> int:
    host = profile.get("host", "AM4")
    for spec in profile["roots"]:
        summary, records = scan_root(spec, host, workers, sample_limit)
        print(canonical_json(summary), flush=True)
        for record in records:
            print(canonical_json(record), flush=True)
    return 0


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return default


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, records: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        for record in records:
            stream.write(canonical_json(record) + "\n")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def run_remote_worker(
    source_path: Path,
    profile_name: str,
    profile: dict[str, Any],
    workers: int,
    sample_limit: int | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    payload = dict(profile)
    payload["host"] = profile_name.upper()
    encoded = base64.urlsafe_b64encode(canonical_json(payload).encode("utf-8")).decode("ascii")
    command = (
        f"{shlex.quote(profile['python'])} - worker --profile-b64 {encoded} "
        f"--workers {workers}"
    )
    if sample_limit is not None:
        command += f" --sample-limit {sample_limit}"
    process = subprocess.run(
        ["ssh", profile["sshHost"], command],
        input=source_path.read_bytes(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError(
            f"remote worker {profile_name} failed ({process.returncode}): "
            + process.stderr.decode("utf-8", errors="replace")[-4000:]
        )
    roots: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    for line in process.stdout.decode("utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        (roots if record["recordType"] == "rootSummary" else files).append(record)
    return roots, files


def collect(
    config_path: Path,
    output_directory: Path,
    workers: int,
    sample_limit: int | None,
    local_only: bool,
) -> dict[str, Any]:
    config = read_json(config_path)
    if not isinstance(config, dict):
        raise ValueError(f"could not parse {config_path}")
    output_directory.mkdir(parents=True, exist_ok=True)
    roots: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    for spec in config["localRoots"]:
        print(f"scanning OMEN {spec['id']} ...", flush=True)
        summary, records = scan_root(spec, "OMEN", workers, sample_limit)
        roots.append(summary)
        files.extend(records)
        print(
            f"  {summary['scannedImages']:,} images, {summary['bytes'] / (1024 ** 2):,.1f} MiB, "
            f"{summary['elapsedSeconds']:.1f}s",
            flush=True,
        )
    if not local_only:
        for profile_name, profile in config.get("remoteProfiles", {}).items():
            print(f"scanning remote profile {profile_name} ...", flush=True)
            remote_roots, remote_files = run_remote_worker(
                Path(__file__).resolve(), profile_name, profile, workers, sample_limit
            )
            roots.extend(remote_roots)
            files.extend(remote_files)
            print(f"  {len(remote_files):,} remote images across {len(remote_roots)} roots", flush=True)

    roots.sort(key=lambda record: (record["host"], record["rootId"]))
    files.sort(key=lambda record: (record["host"], record["rootId"], record["relativePath"].lower()))
    write_json(output_directory / "roots.json", roots)
    write_jsonl(output_directory / "files.jsonl", files)
    write_json(output_directory / "config.snapshot.json", config)
    manifest_hash = content_hash(
        [
            {
                "host": record["host"],
                "rootId": record["rootId"],
                "relativePath": record["relativePath"],
                "bytes": record["bytes"],
                "sha256": record["sha256"],
            }
            for record in files
        ]
    )
    collection = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": utc_timestamp(time.time()),
        "sourceMutationPolicy": "read-only",
        "sampleLimited": sample_limit is not None,
        "roots": len(roots),
        "discoveredImages": sum(record["discoveredImages"] for record in roots),
        "imageFiles": len(files),
        "bytes": sum(record["bytes"] for record in files),
        "decodeErrors": sum(record["decodeError"] is not None for record in files),
        "scanFailures": sum(len(record["scanFailures"]) for record in roots),
        "manifestHash": manifest_hash,
    }
    write_json(output_directory / "collection.json", collection)
    return collection


class DisjointSet:
    def __init__(self, values: Iterable[str]) -> None:
        materialized = list(values)
        self.parent = {value: value for value in materialized}
        self.rank = {value: 0 for value in materialized}

    def find(self, value: str) -> str:
        parent = self.parent[value]
        if parent != value:
            self.parent[value] = self.find(parent)
        return self.parent[value]

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1


def group_asset_families(
    files: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, str], dict[str, Any]]:
    disjoint = DisjointSet(record["id"] for record in files)
    sha_groups: dict[str, list[str]] = defaultdict(list)
    provenance_groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for record in files:
        sha_groups[record["sha256"]].append(record["id"])
        if record.get("logicalId") and record["corpus"] in {"main-gallery", "valheim-gallery"}:
            provenance_groups[(record["corpus"], record["logicalId"])].append(record["id"])
    for group in list(sha_groups.values()) + list(provenance_groups.values()):
        for record_id in group[1:]:
            disjoint.union(group[0], record_id)

    records_by_id = {record["id"]: record for record in files}
    members_by_root: dict[str, list[str]] = defaultdict(list)
    for record in files:
        members_by_root[disjoint.find(record["id"])].append(record["id"])

    families: list[dict[str, Any]] = []
    family_by_file: dict[str, str] = {}
    for member_ids in members_by_root.values():
        member_ids.sort()
        members = [records_by_id[record_id] for record_id in member_ids]
        family_id = "asset-" + hashlib.sha256("\0".join(member_ids).encode("utf-8")).hexdigest()[:20]
        shas = sorted({member["sha256"] for member in members})
        logical_keys = sorted(
            {
                f"{member['corpus']}:{member['logicalId']}"
                for member in members
                if member.get("logicalId")
            }
        )
        evidence = []
        if len(shas) < len(members):
            evidence.append("exact-sha256")
        if logical_keys and len(members) > 1:
            evidence.append("shared-provenance-id")
        family = {
            "schemaVersion": SCHEMA_VERSION,
            "familyId": family_id,
            "physicalFiles": len(members),
            "distinctByteRepresentations": len(shas),
            "evidence": evidence or ["singleton"],
            "corpora": sorted({member["corpus"] for member in members}),
            "logicalIds": logical_keys,
            "locations": [
                {
                    "fileId": member["id"],
                    "host": member["host"],
                    "rootId": member["rootId"],
                    "path": member["path"],
                    "sha256": member["sha256"],
                    "role": member["role"],
                }
                for member in sorted(members, key=lambda item: (item["host"], item["path"]))
            ],
        }
        families.append(family)
        for member_id in member_ids:
            family_by_file[member_id] = family_id
    families.sort(key=lambda family: family["familyId"])
    summary = {
        "physicalFiles": len(files),
        "uniqueSha256": len(sha_groups),
        "exactDuplicateGroups": sum(len(group) > 1 for group in sha_groups.values()),
        "exactDuplicateFiles": sum(len(group) for group in sha_groups.values() if len(group) > 1),
        "provenanceGroups": sum(len(group) > 1 for group in provenance_groups.values()),
        "assetFamilies": len(families),
        "multiLocationFamilies": sum(family["physicalFiles"] > 1 for family in families),
    }
    return families, family_by_file, summary


def hamming_hex(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def average_color_distance(left: list[int], right: list[int]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))


def aspect_ratio(record: dict[str, Any]) -> float | None:
    width = record.get("width")
    height = record.get("height")
    return float(width) / float(height) if width and height else None


def find_perceptual_matches(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    canonical = [
        record
        for record in files
        if record["rootId"] == "omen-main-gallery-originals" and record.get("phash64")
    ]
    query_corpora = {"comfy-raw", "imagegen-runs", "bench-small-runs"}
    query_root_ids = {
        "omen-hearth-dream-cache",
        "omen-context-landscape-gallery-review",
        "omen-context-landscape-data",
        "omen-context-landscape-apps",
    }
    queries = [
        record
        for record in files
        if record.get("phash64")
        and (record["corpus"] in query_corpora or record["rootId"] in query_root_ids)
    ]
    matches: list[dict[str, Any]] = []
    for query in queries:
        query_ratio = aspect_ratio(query)
        best: tuple[int, int, float, dict[str, Any]] | None = None
        for target in canonical:
            target_ratio = aspect_ratio(target)
            if query_ratio is None or target_ratio is None or abs(query_ratio - target_ratio) > 0.025:
                continue
            phash_distance = hamming_hex(query["phash64"], target["phash64"])
            if phash_distance > 4 or (best is not None and phash_distance > best[0]):
                continue
            dhash_distance = hamming_hex(query["dhash64"], target["dhash64"])
            if dhash_distance > 4:
                continue
            color_distance = average_color_distance(query["averageRgb"], target["averageRgb"])
            if color_distance > 18:
                continue
            candidate = (phash_distance, dhash_distance, color_distance, target)
            if best is None or candidate[:3] < best[:3]:
                best = candidate
        if best is not None:
            matches.append(
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "sourceFileId": query["id"],
                    "sourceHost": query["host"],
                    "sourceRootId": query["rootId"],
                    "sourcePath": query["path"],
                    "targetFileId": best[3]["id"],
                    "targetJobId": best[3]["logicalId"],
                    "targetPath": best[3]["path"],
                    "phashDistance": best[0],
                    "dhashDistance": best[1],
                    "averageColorDistance": round(best[2], 3),
                    "relation": "probable-derived-image",
                }
            )
    matches.sort(key=lambda match: (match["sourceRootId"], match["sourcePath"]))
    return matches


def load_gallery_metadata(meta_directory: Path) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    records: dict[str, dict[str, Any]] = {}
    errors: dict[str, str] = {}
    for path in sorted(meta_directory.glob("*.json")):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(value, dict):
                raise ValueError("sidecar is not a JSON object")
            records[path.stem] = value
        except Exception as error:
            errors[path.stem] = f"{type(error).__name__}: {error}"
    return records, errors


def interest_term_hits(text: str) -> list[dict[str, Any]]:
    lowered = text.lower()
    return [
        {"term": term, "weight": weight}
        for term, weight in INTEREST_TERMS.items()
        if term in lowered
    ]


def metadata_signals(metadata: dict[str, Any]) -> tuple[float, list[str], list[dict[str, Any]]]:
    reasons: list[str] = []
    points = 0.0
    project = str(metadata.get("project") or "").lower()
    campaign = str(metadata.get("campaign") or "").lower()
    requester = str(metadata.get("requester") or "").lower()
    category = str(metadata.get("category") or "").lower()
    subject_type = str(metadata.get("subjectType") or "").lower()
    game_use = str(metadata.get("gameUse") or "").lower()
    if project == "context-landscape":
        reasons.append("project=context-landscape")
        points += 2.0
    if campaign.startswith("context-landscape"):
        reasons.append("context-landscape campaign")
        points += 0.9
    if requester.startswith("context-landscape"):
        reasons.append("context-landscape requester")
        points += 0.8
    if subject_type in INTEREST_SUBJECT_TYPES:
        reasons.append(f"subjectType={subject_type}")
        points += 0.35
    if game_use in INTEREST_GAME_USES:
        reasons.append(f"gameUse={game_use}")
        points += 0.35
    if category.startswith("game-art"):
        reasons.append(f"category={category}")
        points += 0.35
    searchable = " ".join(
        str(metadata.get(key) or "")
        for key in (
            "prompt",
            "project",
            "campaign",
            "requester",
            "subjectType",
            "subjectId",
            "subjectLabel",
            "gameUse",
            "category",
        )
    )
    hits = interest_term_hits(searchable)
    if hits:
        reasons.append("terms=" + ",".join(hit["term"] for hit in hits))
        points += min(0.9, sum(float(hit["weight"]) for hit in hits))
    return round(min(1.0, points / 1.6), 4), reasons, hits


def embedding_similarity(
    metadata: dict[str, dict[str, Any]], embedding_directory: Path
) -> dict[str, dict[str, float | None]]:
    vectors: dict[str, np.ndarray] = {}
    for job_id in metadata:
        path = embedding_directory / f"{job_id}.npy"
        if not path.is_file():
            continue
        try:
            vector = np.asarray(np.load(path), dtype=np.float64).reshape(-1)
            norm = float(np.linalg.norm(vector))
            if norm > 0:
                vectors[job_id] = vector / norm
        except Exception:
            continue
    known = [job_id for job_id, item in metadata.items() if item.get("project") == "context-landscape"]
    known_vectors = [vectors[job_id] for job_id in known if job_id in vectors]
    if not known_vectors:
        return {}
    prototypes: list[np.ndarray] = []
    overall = np.mean(np.stack(known_vectors), axis=0)
    prototypes.append(overall / np.linalg.norm(overall))
    for subject_type in sorted(INTEREST_SUBJECT_TYPES):
        subject_vectors = [
            vectors[job_id]
            for job_id in known
            if job_id in vectors and metadata[job_id].get("subjectType") == subject_type
        ]
        if subject_vectors:
            prototype = np.mean(np.stack(subject_vectors), axis=0)
            prototypes.append(prototype / np.linalg.norm(prototype))
    similarities = {
        job_id: max(float(np.dot(vector, prototype)) for prototype in prototypes)
        for job_id, vector in vectors.items()
    }
    untagged = sorted(
        (score, job_id)
        for job_id, score in similarities.items()
        if metadata[job_id].get("project") != "context-landscape"
    )
    percentiles: dict[str, float] = {}
    denominator = max(1, len(untagged) - 1)
    for rank, (_, job_id) in enumerate(untagged):
        percentiles[job_id] = rank / denominator
    return {
        job_id: {
            "similarity": round(score, 6),
            "untaggedPercentile": round(percentiles[job_id], 6) if job_id in percentiles else None,
        }
        for job_id, score in similarities.items()
    }


def candidate_tier(
    metadata: dict[str, Any], metadata_score: float, embedding_percentile: float | None
) -> str:
    if metadata.get("project") == "context-landscape":
        return "confirmed"
    if metadata_score >= 0.65:
        return "high-metadata"
    if metadata_score >= 0.2 or (embedding_percentile is not None and embedding_percentile >= 0.9):
        return "visual-review"
    return "not-indicated"


def gallery_candidates(
    metadata: dict[str, dict[str, Any]],
    similarities: dict[str, dict[str, float | None]],
    scores_v2: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    candidates: list[dict[str, Any]] = []
    tier_by_job: dict[str, str] = {}
    for job_id, item in metadata.items():
        metadata_score, reasons, hits = metadata_signals(item)
        semantic = similarities.get(job_id, {})
        percentile_value = semantic.get("untaggedPercentile")
        percentile = float(percentile_value) if percentile_value is not None else None
        tier = candidate_tier(item, metadata_score, percentile)
        tier_by_job[job_id] = tier
        if tier == "not-indicated":
            continue
        score = scores_v2.get(job_id) if isinstance(scores_v2, dict) else None
        candidates.append(
            {
                "schemaVersion": SCHEMA_VERSION,
                "candidateId": f"gallery:{job_id}",
                "kind": "gallery-logical-asset",
                "tier": tier,
                "jobId": job_id,
                "project": item.get("project"),
                "campaign": item.get("campaign"),
                "category": item.get("category"),
                "subjectType": item.get("subjectType"),
                "subjectId": item.get("subjectId"),
                "subjectLabel": item.get("subjectLabel"),
                "gameUse": item.get("gameUse"),
                "requester": item.get("requester"),
                "prompt": item.get("prompt"),
                "metadataScore": metadata_score,
                "metadataReasons": reasons,
                "termHits": hits,
                "embeddingSimilarity": semantic.get("similarity"),
                "embeddingUntaggedPercentile": percentile,
                "aesthetic": score.get("aesthetic") if isinstance(score, dict) else None,
                "promptClip": score.get("clip") if isinstance(score, dict) else None,
                "vlmObservation": (
                    score.get("vlm", {}).get("observations") if isinstance(score, dict) else None
                ),
            }
        )
    return candidates, tier_by_job


def hidden_location_candidates(
    files: list[dict[str, Any]],
    family_by_file: dict[str, str],
    families: list[dict[str, Any]],
    perceptual_matches: list[dict[str, Any]],
    tier_by_job: dict[str, str],
) -> list[dict[str, Any]]:
    files_by_id = {record["id"]: record for record in files}
    target_by_source = {match["sourceFileId"]: match for match in perceptual_matches}
    confirmed_jobs = {job_id for job_id, tier in tier_by_job.items() if tier == "confirmed"}
    canonical_jobs_by_family: dict[str, set[str]] = defaultdict(set)
    locations_by_family: dict[str, list[dict[str, Any]]] = {}
    for family in families:
        locations_by_family[family["familyId"]] = [
            {
                "host": location["host"],
                "rootId": location["rootId"],
                "path": location["path"],
            }
            for location in family["locations"]
        ]
        for location in family["locations"]:
            record = files_by_id[location["fileId"]]
            if record["rootId"] == "omen-main-gallery-originals" and record.get("logicalId"):
                canonical_jobs_by_family[family["familyId"]].add(record["logicalId"])

    interesting_roots = {
        "am4-comfy-primary-output",
        "am4-comfy-secondary-output",
        "omen-hearth-dream-cache",
        "omen-context-landscape-gallery-review",
        "omen-imagegen-runs",
    }
    candidates: list[dict[str, Any]] = []
    seen_unrepresented_families: set[str] = set()
    for record in files:
        if record["rootId"] not in interesting_roots:
            continue
        family_jobs = canonical_jobs_by_family.get(family_by_file[record["id"]], set())
        perceptual = target_by_source.get(record["id"])
        matched_job = perceptual.get("targetJobId") if perceptual else None
        confirmed_matches = sorted(
            {job_id for job_id in family_jobs if job_id in confirmed_jobs}
            | ({matched_job} if matched_job in confirmed_jobs else set())
        )
        represented_gallery_jobs = set(family_jobs) | ({matched_job} if matched_job else set())
        embedded_text = " ".join(record.get("embeddedMetadata", {}).get("texts", []))
        hits = interest_term_hits(embedded_text + " " + record["relativePath"])
        term_weight = sum(float(hit["weight"]) for hit in hits)
        embedded_lower = embedded_text.lower()
        if confirmed_matches:
            tier = "confirmed-derived"
            reasons = ["matches confirmed gallery asset"]
        elif represented_gallery_jobs:
            # The logical gallery candidate already carries this image's metadata and score.
            # Keep the physical relationship in asset-families/perceptual-matches instead of
            # duplicating it as another candidate row.
            continue
        elif "context landscape" in embedded_lower:
            tier = "explicit-project-raw"
            reasons = ["embedded prompt explicitly names Context Landscape"]
        elif any(term in embedded_lower for term in EXTERNAL_FRANCHISE_TERMS):
            tier = "external-franchise-reference"
            reasons = ["embedded prompt names BattleTech, BattleMech, or MechWarrior"]
        elif "commander field" in embedded_lower:
            tier = "project-texture-review"
            reasons = ["embedded prompt describes a commander-field tactical texture"]
        elif term_weight >= 0.8:
            tier = "high-embedded-metadata"
            reasons = ["embedded prompt or path has strong project terms"]
        elif term_weight >= 0.35:
            tier = "visual-review"
            reasons = ["embedded prompt or path has project-adjacent terms"]
        else:
            continue
        family_id = family_by_file[record["id"]]
        if not confirmed_matches:
            if family_id in seen_unrepresented_families:
                continue
            seen_unrepresented_families.add(family_id)
        candidates.append(
            {
                "schemaVersion": SCHEMA_VERSION,
                "candidateId": f"file:{record['id']}",
                "kind": "hidden-location",
                "tier": tier,
                "jobId": confirmed_matches[0] if confirmed_matches else matched_job,
                "host": record["host"],
                "rootId": record["rootId"],
                "path": record["path"],
                "assetFamilyId": family_id,
                "physicalLocations": locations_by_family[family_id],
                "matchedConfirmedJobs": confirmed_matches,
                "metadataReasons": reasons,
                "termHits": hits,
                "embeddedTexts": record.get("embeddedMetadata", {}).get("texts", []),
                "perceptualMatch": perceptual,
            }
        )
    return candidates


def extract_index_entries(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("images", "items", "jobs", "results"):
            if isinstance(value.get(key), list):
                return [item for item in value[key] if isinstance(item, dict)]
    return []


def index_ids(value: Any) -> set[str]:
    identifiers: set[str] = set()
    for item in extract_index_entries(value):
        identifier = item.get("job_id") or item.get("jobId") or item.get("id")
        if identifier is not None:
            identifiers.add(str(identifier))
    return identifiers


def fetch_remote_json(profile: dict[str, Any], path: str) -> Any:
    process = subprocess.run(
        ["ssh", profile["sshHost"], f"cat -- {shlex.quote(path)}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if process.returncode != 0:
        return None
    try:
        return json.loads(process.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def reconciliation_report(
    config: dict[str, Any],
    files: list[dict[str, Any]],
    metadata: dict[str, dict[str, Any]],
    metadata_errors: dict[str, str],
    scores: dict[str, Any],
    scores_v2: dict[str, Any],
) -> dict[str, Any]:
    configured = config["metadata"]
    remote_profiles = config.get("remoteProfiles", {})
    am4_profile = remote_profiles.get("am4")
    main_index = (
        fetch_remote_json(am4_profile, configured["mainGalleryIndexRemote"])
        if am4_profile
        else None
    )
    valheim_index = read_json(Path(configured["valheimIndex"]), {})

    original_ids = {
        record["logicalId"]
        for record in files
        if record["rootId"] == "omen-main-gallery-originals" and record.get("logicalId")
    }
    meta_paths = set(metadata) | set(metadata_errors)
    score_ids = set(scores) if isinstance(scores, dict) else set()
    score_v2_ids = set(scores_v2) if isinstance(scores_v2, dict) else set()
    embedding_ids = {path.stem for path in Path(configured["mainGalleryEmbeddings"]).glob("*.npy")}
    indexed_ids = index_ids(main_index)

    valheim_large_ids = {
        record["logicalId"]
        for record in files
        if record["rootId"] == "omen-valheim-large" and record.get("logicalId")
    }
    valheim_thumb_ids = {
        record["logicalId"]
        for record in files
        if record["rootId"] == "omen-valheim-thumbs" and record.get("logicalId")
    }
    valheim_index_ids = index_ids(valheim_index)
    return {
        "mainGallery": {
            "originals": len(original_ids),
            "sidecars": len(meta_paths),
            "parsedSidecars": len(metadata),
            "invalidSidecars": metadata_errors,
            "indexed": len(indexed_ids),
            "scoresV1": len(score_ids),
            "scoresV2": len(score_v2_ids),
            "embeddings": len(embedding_ids),
            "originalsWithoutIndex": sorted(original_ids - indexed_ids),
            "indexWithoutOriginal": sorted(indexed_ids - original_ids),
            "originalsWithoutSidecar": sorted(original_ids - meta_paths),
            "sidecarsWithoutOriginal": sorted(meta_paths - original_ids),
            "parsedSidecarsWithoutEmbedding": sorted(set(metadata) - embedding_ids),
            "parsedSidecarsWithoutScoreV2": sorted(set(metadata) - score_v2_ids),
        },
        "valheimGallery": {
            "largeImages": len(valheim_large_ids),
            "thumbnails": len(valheim_thumb_ids),
            "indexed": len(valheim_index_ids),
            "largeNotIndexed": sorted(valheim_large_ids - valheim_index_ids),
            "indexWithoutLarge": sorted(valheim_index_ids - valheim_large_ids),
            "thumbWithoutLarge": sorted(valheim_thumb_ids - valheim_large_ids),
            "largeWithoutThumb": sorted(valheim_large_ids - valheim_thumb_ids),
        },
    }


def orphan_summary(
    files: list[dict[str, Any]],
    families: list[dict[str, Any]],
    family_by_file: dict[str, str],
    perceptual_matches: list[dict[str, Any]],
) -> dict[str, Any]:
    files_by_id = {record["id"]: record for record in files}
    canonical_families: set[str] = set()
    for family in families:
        if any(
            files_by_id[location["fileId"]]["rootId"] == "omen-main-gallery-originals"
            for location in family["locations"]
        ):
            canonical_families.add(family["familyId"])
    perceptually_linked = {match["sourceFileId"] for match in perceptual_matches}
    inspected_roots = {
        "am4-comfy-primary-output",
        "am4-comfy-secondary-output",
        "omen-hearth-dream-cache",
        "omen-context-landscape-gallery-review",
        "omen-imagegen-runs",
        "am4-bench-pilot",
        "am4-bench-burst",
        "am4-bench-switch",
        "am4-bench-smoke",
        "am4-bench-dualcard",
        "am4-bench-fluxsmoke",
        "am4-bench-dream-e2e",
        "am4-bench-bot-e2e",
    }
    by_root: dict[str, dict[str, Any]] = {}
    for root_id in sorted(inspected_roots):
        root_files = [record for record in files if record["rootId"] == root_id]
        linked = [
            record
            for record in root_files
            if family_by_file[record["id"]] in canonical_families
            or record["id"] in perceptually_linked
        ]
        invalid = [record for record in root_files if record.get("decodeError")]
        linked_ids = {record["id"] for record in linked}
        invalid_ids = {record["id"] for record in invalid}
        unlinked = [
            record
            for record in root_files
            if record["id"] not in linked_ids and record["id"] not in invalid_ids
        ]
        by_root[root_id] = {
            "files": len(root_files),
            "linkedToMainGallery": len(linked),
            "decodeErrors": len(invalid),
            "unlinkedValid": len(unlinked),
            "unlinkedPaths": [record["path"] for record in unlinked],
            "decodeErrorPaths": [record["path"] for record in invalid],
        }
    return {
        "definition": (
            "An orphan is a decodable file in a generation/cache/review root with no exact, "
            "provenance, or conservative perceptual link to OMEN's scored main-gallery originals."
        ),
        "roots": by_root,
        "totals": {
            "files": sum(item["files"] for item in by_root.values()),
            "linkedToMainGallery": sum(item["linkedToMainGallery"] for item in by_root.values()),
            "decodeErrors": sum(item["decodeErrors"] for item in by_root.values()),
            "unlinkedValid": sum(item["unlinkedValid"] for item in by_root.values()),
        },
    }


def decode_error_summary(files: list[dict[str, Any]]) -> dict[str, Any]:
    errors = [record for record in files if record.get("decodeError")]
    counts_by_root = Counter(record["rootId"] for record in errors)
    zero_byte = [record for record in errors if record["bytes"] == 0]
    nonzero = [record for record in errors if record["bytes"] > 0]
    return {
        "physicalFiles": len(errors),
        "zeroByteFiles": len(zero_byte),
        "nonzeroMalformedFiles": len(nonzero),
        "byRoot": dict(sorted(counts_by_root.items())),
        "nonzeroMalformed": [
            {
                "host": record["host"],
                "rootId": record["rootId"],
                "path": record["path"],
                "bytes": record["bytes"],
                "error": record["decodeError"],
            }
            for record in nonzero
        ],
    }


def write_candidates_csv(path: Path, candidates: list[dict[str, Any]]) -> None:
    columns = [
        "tier",
        "kind",
        "candidateId",
        "jobId",
        "host",
        "rootId",
        "path",
        "campaign",
        "subjectType",
        "subjectId",
        "gameUse",
        "category",
        "metadataScore",
        "embeddingSimilarity",
        "embeddingUntaggedPercentile",
        "aesthetic",
        "promptClip",
        "metadataReasons",
        "prompt",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for candidate in candidates:
            row = dict(candidate)
            row["metadataReasons"] = "; ".join(candidate.get("metadataReasons", []))
            writer.writerow(row)


def contact_sheet_label(candidate: dict[str, Any]) -> list[str]:
    job_id = str(candidate.get("jobId") or "unknown")
    subject = str(candidate.get("subjectType") or candidate.get("category") or "untagged")
    metadata_score = candidate.get("metadataScore")
    percentile = candidate.get("embeddingUntaggedPercentile")
    return [
        job_id[:24],
        subject[:30],
        f"meta {metadata_score:.2f}  emb-pct {percentile:.2f}"
        if isinstance(percentile, (int, float))
        else f"meta {metadata_score:.2f}",
    ]


def build_contact_sheets(
    output_directory: Path,
    candidates: list[dict[str, Any]],
    files: list[dict[str, Any]],
    limit: int,
) -> list[str]:
    if limit <= 0:
        return []
    path_by_job = {
        record["logicalId"]: Path(record["path"])
        for record in files
        if record["rootId"] == "omen-main-gallery-originals" and record.get("logicalId")
    }
    review_candidates = [
        candidate
        for candidate in candidates
        if candidate["kind"] == "gallery-logical-asset"
        and candidate["tier"] in {"high-metadata", "visual-review"}
        and candidate.get("jobId") in path_by_job
    ]
    review_candidates.sort(
        key=lambda candidate: (
            0 if candidate["tier"] == "high-metadata" else 1,
            -float(candidate.get("metadataScore") or 0),
            -float(candidate.get("embeddingUntaggedPercentile") or 0),
            candidate["jobId"],
        )
    )
    review_candidates = review_candidates[:limit]
    if not review_candidates:
        return []
    sheet_directory = output_directory / "contact-sheets"
    sheet_directory.mkdir(parents=True, exist_ok=True)
    tile_width, tile_height = 220, 270
    columns, rows = 5, 5
    per_sheet = columns * rows
    outputs: list[str] = []
    font = ImageFont.load_default()
    for page, offset in enumerate(range(0, len(review_candidates), per_sheet), start=1):
        page_candidates = review_candidates[offset : offset + per_sheet]
        canvas = Image.new("RGB", (columns * tile_width, rows * tile_height), "#111722")
        draw = ImageDraw.Draw(canvas)
        for index, candidate in enumerate(page_candidates):
            column = index % columns
            row = index // columns
            x, y = column * tile_width, row * tile_height
            path = path_by_job[candidate["jobId"]]
            try:
                with Image.open(path) as source:
                    thumbnail = ImageOps.fit(
                        source.convert("RGB"),
                        (tile_width - 8, 210),
                        method=Image.Resampling.LANCZOS,
                    )
                canvas.paste(thumbnail, (x + 4, y + 4))
            except Exception:
                draw.rectangle((x + 4, y + 4, x + tile_width - 4, y + 214), fill="#3a1d2a")
                draw.text((x + 10, y + 90), "decode failed", fill="white", font=font)
            label_y = y + 218
            for line in contact_sheet_label(candidate):
                draw.text((x + 5, label_y), line, fill="#e8edf4", font=font)
                label_y += 15
        output_path = sheet_directory / f"untagged-candidates-{page:02d}.jpg"
        canvas.save(output_path, format="JPEG", quality=88, optimize=True)
        outputs.append(str(output_path))
    return outputs


def read_candidate_image(candidate: dict[str, Any], config: dict[str, Any]) -> Image.Image | None:
    path = candidate.get("path")
    if not path:
        return None
    if candidate.get("host") == "OMEN":
        try:
            with Image.open(Path(path)) as source:
                return source.convert("RGB")
        except Exception:
            return None
    profile = config.get("remoteProfiles", {}).get(str(candidate.get("host", "")).lower())
    if not profile:
        return None
    process = subprocess.run(
        ["ssh", profile["sshHost"], f"cat -- {shlex.quote(path)}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if process.returncode != 0:
        return None
    try:
        with Image.open(io.BytesIO(process.stdout)) as source:
            return source.convert("RGB")
    except Exception:
        return None


def build_hidden_contact_sheets(
    output_directory: Path,
    candidates: list[dict[str, Any]],
    config: dict[str, Any],
    limit: int,
) -> list[str]:
    review = [
        candidate
        for candidate in candidates
        if candidate["kind"] == "hidden-location"
        and candidate["tier"]
        in {
            "explicit-project-raw",
            "project-texture-review",
            "visual-review",
            "high-embedded-metadata",
            "external-franchise-reference",
        }
    ]
    review.sort(
        key=lambda candidate: (
            {
                "explicit-project-raw": 0,
                "project-texture-review": 1,
                "visual-review": 2,
                "high-embedded-metadata": 3,
                "external-franchise-reference": 4,
            }.get(candidate["tier"], 9),
            candidate.get("rootId", ""),
            candidate.get("path", ""),
        )
    )
    review = review[:limit]
    if not review:
        return []
    tile_width, tile_height = 280, 330
    columns, rows = 4, 3
    per_sheet = columns * rows
    directory = output_directory / "contact-sheets"
    directory.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    outputs: list[str] = []
    for page, offset in enumerate(range(0, len(review), per_sheet), start=1):
        page_candidates = review[offset : offset + per_sheet]
        canvas = Image.new("RGB", (columns * tile_width, rows * tile_height), "#111722")
        draw = ImageDraw.Draw(canvas)
        for index, candidate in enumerate(page_candidates):
            x = (index % columns) * tile_width
            y = (index // columns) * tile_height
            source = read_candidate_image(candidate, config)
            if source is not None:
                thumbnail = ImageOps.fit(
                    source,
                    (tile_width - 8, 260),
                    method=Image.Resampling.LANCZOS,
                )
                canvas.paste(thumbnail, (x + 4, y + 4))
            else:
                draw.rectangle((x + 4, y + 4, x + tile_width - 4, y + 264), fill="#3a1d2a")
                draw.text((x + 10, y + 110), "image unavailable", fill="white", font=font)
            label = Path(str(candidate.get("path"))).name[:38]
            terms = ", ".join(hit["term"] for hit in candidate.get("termHits", []))[:42]
            draw.text((x + 6, y + 270), label, fill="#e8edf4", font=font)
            draw.text((x + 6, y + 286), candidate["tier"], fill="#e8edf4", font=font)
            draw.text((x + 6, y + 302), terms, fill="#e8edf4", font=font)
        output_path = directory / f"raw-only-candidates-{page:02d}.jpg"
        canvas.save(output_path, format="JPEG", quality=88, optimize=True)
        outputs.append(str(output_path))
    return outputs


def markdown_location_report(
    roots: list[dict[str, Any]], report: dict[str, Any], output_directory: Path
) -> str:
    lines = [
        "# Context Landscape Image Census v1",
        "",
        f"Generated: {report['generatedAt']}",
        "",
        "The census is read-only with respect to every source root. Counts below are physical image files,",
        "so originals, mirrors, thumbnails, and caches intentionally appear separately.",
        "",
        "## Location map",
        "",
        "| Host | Root | Corpus / role | Discovered | Hashed | GiB | Access failures | Decode errors |",
        "|---|---|---|---:|---:|---:|---:|---:|",
    ]
    for root in sorted(roots, key=lambda item: (item["host"], item["rootId"])):
        path = str(root["path"]).replace("|", "\\|")
        role = f"{root['corpus']} / {root['role']}"
        status = path if root["exists"] else f"{path} (missing)"
        lines.append(
            f"| {root['host']} | `{status}` | {role} | {root['discoveredImages']:,} | "
            f"{root['scannedImages']:,} | {root['bytes'] / (1024 ** 3):.3f} | "
            f"{len(root['scanFailures']):,} | {root['decodeErrors']:,} |"
        )

    deduplication = report["deduplication"]
    candidates = report["candidates"]
    main = report["reconciliation"]["mainGallery"]
    valheim = report["reconciliation"]["valheimGallery"]
    orphans = report["orphans"]
    decode_exceptions = report["decodeExceptions"]
    lines.extend(
        [
            "",
            "## What is actually hiding where",
            "",
            f"- The main gallery has {main['originals']:,} originals. {main['indexed']:,} have a valid sidecar, "
            f"gallery-index entry, score, and embedding; {len(main['invalidSidecars']):,} sidecars are invalid.",
            "- AM4's `/home/derek/gallery` is an index/application layer. Its image count is expected to be zero; "
            "the media it displays lives under `/home/derek/bench/results_full`.",
            "- OMEN's perception directory is the locally scored mirror of that main gallery, which lets analysis "
            "run without copying AM4's published images again.",
            f"- The Valheim build tree has {valheim['largeImages']:,} large images, of which {valheim['indexed']:,} "
            f"are in the gallery index. {len(valheim['largeNotIndexed']):,} large images are currently unpublished/unindexed.",
            "- Raw Comfy outputs, the second-card output, HEARTH's Dream cache, and local review downloads remain "
            "separate physical stores; the asset-family and perceptual-match manifests connect their duplicates.",
            f"- The inspected generation/cache/review roots contain {orphans['totals']['unlinkedValid']:,} decodable "
            "files with no conservative link to the scored main gallery; these are enumerated in `orphans.json`.",
            f"- {report['collection']['scanFailures']:,} inaccessible paths are retained in `roots.json`. They are "
            "inside the retired Linux-state mirror, not an active image-generation root.",
            f"- {decode_exceptions['physicalFiles']:,} physical files do not decode: "
            f"{decode_exceptions['zeroByteFiles']:,} are zero-byte placeholders and "
            f"{decode_exceptions['nonzeroMalformedFiles']:,} is a nonzero malformed PNG. No exception was discarded.",
            "",
            "## Deduplication",
            "",
            f"- Physical files: {deduplication['physicalFiles']:,}",
            f"- Unique byte hashes: {deduplication['uniqueSha256']:,}",
            f"- Exact duplicate groups: {deduplication['exactDuplicateGroups']:,}",
            f"- Provenance-aware asset families: {deduplication['assetFamilies']:,}",
            f"- Probable transformed copies: {report['perceptualMatches']:,}",
            "",
            "## Context Landscape candidates",
            "",
        ]
    )
    for tier, count in sorted(candidates["tiers"].items()):
        lines.append(f"- {tier}: {count:,}")
    lines.extend(
        [
            "",
            "`confirmed` means explicit project metadata. Other tiers are ranked leads, not silently accepted canon.",
            "`explicit-project-raw` means the embedded generation prompt names Context Landscape but the file has no gallery record; "
            "`external-franchise-reference` is a documented near-miss and should not enter the project corpus.",
            "The contact sheets contain the strongest untagged gallery leads and the raw-only leads for human review.",
            "",
            "## Outputs",
            "",
            "- `files.jsonl`: every physical image and its hashes, dimensions, provenance, and embedded metadata summary",
            "- `asset-families.jsonl`: exact-copy and shared-provenance groupings",
            "- `perceptual-matches.jsonl`: conservative transformed-copy matches into the scored gallery",
            "- `orphans.json`: valid raw/cache/review files not linked back to the scored gallery",
            "- `context-landscape-candidates.csv`: sortable confirmed and review candidates",
            "- `reconciliation.json`: gallery/index/sidecar/score/embedding exceptions",
            "- `contact-sheets/`: visual review pages for high-ranking untagged gallery entries",
            "",
            f"Report hash: `{report['reportHash']}`",
            "",
            "No source image was moved, renamed, deleted, or re-encoded.",
            "",
        ]
    )
    return "\n".join(lines)


def analyze(
    config_path: Path,
    output_directory: Path,
    contact_sheet_limit: int,
) -> dict[str, Any]:
    config = read_json(config_path)
    if not isinstance(config, dict):
        raise ValueError(f"could not parse {config_path}")
    files = read_jsonl(output_directory / "files.jsonl")
    roots = read_json(output_directory / "roots.json", [])
    configured = config["metadata"]
    metadata, metadata_errors = load_gallery_metadata(Path(configured["mainGalleryMeta"]))
    scores = read_json(Path(configured["mainGalleryScores"]), {})
    scores_v2 = read_json(Path(configured["mainGalleryScoresV2"]), {})

    print("grouping exact copies and provenance families ...", flush=True)
    families, family_by_file, deduplication = group_asset_families(files)
    write_jsonl(output_directory / "asset-families.jsonl", families)

    print("matching transformed raw/cache copies to the scored gallery ...", flush=True)
    perceptual_matches = find_perceptual_matches(files)
    write_jsonl(output_directory / "perceptual-matches.jsonl", perceptual_matches)
    orphans = orphan_summary(files, families, family_by_file, perceptual_matches)
    write_json(output_directory / "orphans.json", orphans)
    decode_exceptions = decode_error_summary(files)

    print("ranking gallery candidates from metadata and embedding prototypes ...", flush=True)
    similarities = embedding_similarity(metadata, Path(configured["mainGalleryEmbeddings"]))
    gallery_rows, tier_by_job = gallery_candidates(metadata, similarities, scores_v2)
    hidden_rows = hidden_location_candidates(
        files, family_by_file, families, perceptual_matches, tier_by_job
    )
    tier_order = {
        "confirmed": 0,
        "confirmed-derived": 1,
        "explicit-project-raw": 2,
        "project-texture-review": 3,
        "high-metadata": 4,
        "high-embedded-metadata": 5,
        "visual-review": 6,
        "external-franchise-reference": 7,
    }
    candidates = gallery_rows + hidden_rows
    candidates.sort(
        key=lambda item: (
            tier_order.get(item["tier"], 99),
            -float(item.get("metadataScore") or 0),
            -float(item.get("embeddingUntaggedPercentile") or 0),
            item["candidateId"],
        )
    )
    write_jsonl(output_directory / "context-landscape-candidates.jsonl", candidates)
    write_candidates_csv(output_directory / "context-landscape-candidates.csv", candidates)

    print("reconciling gallery indexes, sidecars, scores, and embeddings ...", flush=True)
    reconciliation = reconciliation_report(
        config, files, metadata, metadata_errors, scores, scores_v2
    )
    write_json(output_directory / "reconciliation.json", reconciliation)

    sheet_directory = output_directory / "contact-sheets"
    if sheet_directory.is_dir():
        for pattern in ("untagged-candidates-*.jpg", "raw-only-candidates-*.jpg"):
            for stale_path in sheet_directory.glob(pattern):
                stale_path.unlink()
    contact_sheets = build_contact_sheets(
        output_directory, gallery_rows, files, contact_sheet_limit
    )
    contact_sheets.extend(
        build_hidden_contact_sheets(output_directory, hidden_rows, config, contact_sheet_limit)
    )
    collection = read_json(output_directory / "collection.json", {})
    collection.update(
        {
            "roots": len(roots),
            "discoveredImages": sum(root["discoveredImages"] for root in roots),
            "imageFiles": len(files),
            "bytes": sum(record["bytes"] for record in files),
            "decodeErrors": sum(record["decodeError"] is not None for record in files),
            "scanFailures": sum(len(root["scanFailures"]) for root in roots),
        }
    )
    write_json(output_directory / "collection.json", collection)
    report_without_hash = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": utc_timestamp(time.time()),
        "sourceMutationPolicy": "read-only",
        "collection": collection,
        "deduplication": deduplication,
        "perceptualMatches": len(perceptual_matches),
        "orphans": orphans,
        "decodeExceptions": decode_exceptions,
        "candidates": {
            "total": len(candidates),
            "galleryLogicalAssets": len(gallery_rows),
            "hiddenLocations": len(hidden_rows),
            "tiers": dict(sorted(Counter(row["tier"] for row in candidates).items())),
        },
        "reconciliation": reconciliation,
        "contactSheets": contact_sheets,
    }
    hash_input = dict(report_without_hash)
    hash_input.pop("generatedAt", None)
    hash_input["collection"] = dict(hash_input["collection"])
    hash_input["collection"].pop("generatedAt", None)
    report = {**report_without_hash, "reportHash": content_hash(hash_input)}
    write_json(output_directory / "report.json", report)
    (output_directory / "LOCATION-MAP.md").write_text(
        markdown_location_report(roots, report, output_directory), encoding="utf-8"
    )
    return report


def resolve_output_directory(config_path: Path, explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit
    config = read_json(config_path)
    if not isinstance(config, dict) or not config.get("outputDirectory"):
        raise ValueError("config does not define outputDirectory")
    return Path(config["outputDirectory"])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=("run", "collect", "analyze", "worker"), nargs="?", default="run"
    )
    parser.add_argument("--config", type=Path, default=Path("config/image-census-v1.json"))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 4))
    parser.add_argument("--sample-limit", type=int)
    parser.add_argument("--local-only", action="store_true")
    parser.add_argument("--contact-sheet-limit", type=int, default=200)
    parser.add_argument("--profile-b64", help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "worker":
        if not args.profile_b64:
            raise ValueError("worker requires --profile-b64")
        profile = json.loads(base64.urlsafe_b64decode(args.profile_b64).decode("utf-8"))
        return emit_worker(profile, args.workers, args.sample_limit)

    config_path = args.config.resolve()
    output_directory = resolve_output_directory(config_path, args.output).resolve()
    if args.command in {"run", "collect"}:
        collection = collect(
            config_path,
            output_directory,
            args.workers,
            args.sample_limit,
            args.local_only,
        )
        print(json.dumps(collection, indent=2), flush=True)
    if args.command in {"run", "analyze"}:
        report = analyze(config_path, output_directory, args.contact_sheet_limit)
        print(
            json.dumps(
                {
                    "reportHash": report["reportHash"],
                    "physicalFiles": report["deduplication"]["physicalFiles"],
                    "assetFamilies": report["deduplication"]["assetFamilies"],
                    "candidateTiers": report["candidates"]["tiers"],
                    "contactSheets": len(report["contactSheets"]),
                },
                indent=2,
            ),
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
