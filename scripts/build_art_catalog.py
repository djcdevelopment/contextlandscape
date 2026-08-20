#!/usr/bin/env python3
"""Compile the read-only image census into a content-addressed web catalog."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageOps

CENSUS_HASH = "sha256:928a78fd7f9a6adae62eead18553088aa4d360d338506bac0c73d529fd10369f"
ALLOWED_TIERS = {"confirmed", "confirmed-derived", "explicit-project-raw", "project-texture-review", "visual-review"}
EXCLUDED_TIERS = {"external-franchise-reference"}
ROLE_ORDER = {"scored-original-mirror": 0, "application-asset": 1, "project-asset": 2, "published-original": 3, "primary-generation-output": 4}


def rows(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def classify(candidate: dict[str, Any]) -> str:
    subject_type = str(candidate.get("subjectType") or "").lower()
    game_use = str(candidate.get("gameUse") or "").lower()
    text = " ".join([
        subject_type,
        game_use,
        str(candidate.get("subjectId") or ""),
        str(candidate.get("subjectLabel") or ""),
        str(candidate.get("prompt") or ""),
        str(candidate.get("vlmObservation") or ""),
        " ".join(candidate.get("embeddedTexts") or []),
    ]).lower()
    if subject_type == "commander" or "commander-portrait" in game_use:
        return "commander"
    if subject_type == "battlefield" or "battlefield" in game_use or any(term in text for term in ("battlefield background", "commander field", "cartographic relief")):
        return "battlefield"
    if subject_type in {"mech", "unit"} or any(term in text for term in (" scout ", " line mech", " heavy mech", " siege mech", " robot", " mech ")):
        return "unit"
    return "event"


def title(candidate: dict[str, Any], asset_id: str) -> str:
    value = candidate.get("subjectLabel") or candidate.get("subjectId") or candidate.get("jobId") or asset_id
    return re.sub(r"[-_]+", " ", str(value)).strip().title()[:180]


def safe_id(candidate: dict[str, Any]) -> str:
    raw = str(candidate.get("jobId") or candidate.get("subjectId") or candidate.get("candidateId") or candidate.get("assetFamilyId"))
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", raw).strip("-")[:150]


def source_for(candidate: dict[str, Any], families: dict[str, dict[str, Any]], files: dict[str, dict[str, Any]], family_by_logical_id: dict[str, str]) -> tuple[str, str, str] | None:
    family_id = candidate.get("assetFamilyId")
    if not family_id and str(candidate.get("candidateId", "")).startswith("gallery:"):
        logical = "main-gallery:" + str(candidate["candidateId"]).split(":", 1)[1]
        family_id = family_by_logical_id.get(logical)
    family = families.get(str(family_id)) if family_id else None
    locations = list((family or {}).get("locations", [])) or list(candidate.get("physicalLocations") or [])
    locations.sort(key=lambda item: (0 if item.get("host") == "OMEN" else 1, ROLE_ORDER.get(str(item.get("role")), 50), str(item.get("path"))))
    for location in locations:
        path = str(location.get("path") or "")
        if path and (location.get("host") == "AM4" or Path(path).exists()):
            record = files.get(str(location.get("fileId")), {})
            digest = location.get("sha256") or record.get("sha256")
            return path, str(location.get("host") or record.get("host") or "OMEN"), str(digest or "")
    return None


def materialize(path: str, host: str, allow_ssh: bool, temporary: Path) -> Path | None:
    local = Path(path)
    if local.exists():
        return local
    if host != "AM4" or not allow_ssh:
        return None
    target = temporary / Path(path).name
    with target.open("wb") as handle:
        completed = subprocess.run(["ssh", "am4", f"cat -- {shlex.quote(path)}"], stdout=handle, stderr=subprocess.PIPE, check=False)
    if completed.returncode != 0 or not target.stat().st_size:
        target.unlink(missing_ok=True)
        return None
    return target


def derivative(source: Path, destination: Path, size: tuple[int, int], fit: bool) -> None:
    if destination.is_file() and destination.stat().st_size > 0:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        if fit:
            image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS)
        else:
            image.thumbnail(size, Image.Resampling.LANCZOS)
        image.save(destination, "WEBP", quality=84, method=6)


def clean_output(output: Path) -> None:
    resolved = output.resolve()
    protected = {Path(resolved.anchor), Path.home().resolve(), Path.cwd().resolve()}
    if resolved in protected or len(resolved.parts) < 3:
        raise ValueError(f"refusing to recursively clean broad output path: {resolved}")
    shutil.rmtree(resolved)


def prune_derivatives(output: Path, items: list[dict[str, Any]]) -> int:
    referenced = {
        source.removeprefix("/media/art/")
        for item in items
        for source in (item["thumbnailSrc"], item["cardSrc"], item.get("battlefieldSrc"))
        if source
    }
    removed = 0
    for directory in ("thumb", "card", "battlefield"):
        root = output / directory
        if not root.is_dir():
            continue
        for path in root.glob("*.webp"):
            if path.relative_to(output).as_posix() not in referenced:
                path.unlink()
                removed += 1
    return removed


def compile_catalog(census: Path, output: Path, allow_ssh: bool) -> dict[str, Any]:
    families = {row["familyId"]: row for row in rows(census / "asset-families.jsonl")}
    family_by_logical_id = {
        str(logical_id): family_id
        for family_id, family in families.items()
        for logical_id in family.get("logicalIds", [])
    }
    files = {row["id"]: row for row in rows(census / "files.jsonl") if row.get("recordType") == "imageFile"}
    candidates = []
    for row in rows(census / "context-landscape-candidates.jsonl"):
        if row.get("tier") not in ALLOWED_TIERS or row.get("tier") in EXCLUDED_TIERS:
            continue
        if not row.get("assetFamilyId") and str(row.get("candidateId", "")).startswith("gallery:"):
            logical_id = "main-gallery:" + str(row["candidateId"]).split(":", 1)[1]
            family_id = family_by_logical_id.get(logical_id)
            if family_id:
                row = {**row, "assetFamilyId": family_id}
        candidates.append(row)
    selected: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        family = str(candidate.get("assetFamilyId") or candidate.get("candidateId"))
        current = selected.get(family)
        rank = (0 if candidate.get("tier") == "confirmed" else 1, -float(candidate.get("aesthetic") or 0), str(candidate.get("candidateId")))
        if current is None or rank < current["_rank"]:
            selected[family] = {**candidate, "_rank": rank}

    items: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    asset_id_counts: dict[str, int] = {}
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="context-landscape-art-") as temp_dir:
        temporary = Path(temp_dir)
        for candidate in sorted(selected.values(), key=lambda row: str(row.get("candidateId"))):
            located = source_for(candidate, families, files, family_by_logical_id)
            if not located:
                skipped.append({"candidateId": str(candidate.get("candidateId")), "reason": "source-not-located"})
                continue
            path, host, known_digest = located
            source = materialize(path, host, allow_ssh, temporary)
            if not source:
                skipped.append({"candidateId": str(candidate.get("candidateId")), "reason": "source-not-local"})
                continue
            content = source.read_bytes()
            digest = hashlib.sha256(content).hexdigest()
            if known_digest and digest != known_digest:
                skipped.append({"candidateId": str(candidate.get("candidateId")), "reason": "source-hash-mismatch"})
                continue
            base_asset_id = safe_id(candidate)
            occurrence = asset_id_counts.get(base_asset_id, 0)
            asset_id_counts[base_asset_id] = occurrence + 1
            asset_id = base_asset_id if occurrence == 0 else f"{base_asset_id[:140]}-{occurrence + 1}"
            stem = f"{digest[:20]}-{asset_id[:72]}"
            try:
                with Image.open(source) as image:
                    width, height = image.size
                aspect = "square" if 0.85 <= width / height <= 1.18 else "landscape" if width > height else "portrait"
                derivative(source, output / "thumb" / f"{stem}.webp", (320, 240), True)
                derivative(source, output / "card" / f"{stem}.webp", (900, 900), False)
                kind = classify(candidate)
                battlefield_src = None
                if kind == "battlefield":
                    derivative(source, output / "battlefield" / f"{stem}.webp", (1920, 1080), True)
                    battlefield_src = f"/media/art/battlefield/{stem}.webp"
            except Exception as error:  # Pillow supplies the actionable decoder error.
                skipped.append({"candidateId": str(candidate.get("candidateId")), "reason": f"decode:{error}"})
                continue
            label = title(candidate, asset_id)
            items.append({
                "schemaVersion": 1,
                "assetId": asset_id,
                "familyId": str(candidate.get("assetFamilyId") or candidate.get("candidateId")),
                "contentHash": f"sha256:{digest}",
                "tier": candidate["tier"],
                "kind": kind,
                "title": label,
                "alt": (str(candidate.get("vlmObservation") or candidate.get("subjectLabel") or label))[:500],
                "subjects": [str(value)[:120] for value in (candidate.get("subjectId"), candidate.get("subjectType"), candidate.get("gameUse")) if value],
                "aspect": aspect,
                "focalPoint": {"x": 50, "y": 45},
                "thumbnailSrc": f"/media/art/thumb/{stem}.webp",
                "cardSrc": f"/media/art/card/{stem}.webp",
                "battlefieldSrc": battlefield_src,
                "experimental": candidate["tier"] != "confirmed",
            })

    prune_derivatives(output, items)
    canonical = json.dumps(items, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    catalog = {
        "schemaVersion": "context-landscape-art-catalog/v1",
        "censusReportHash": CENSUS_HASH,
        "catalogHash": "sha256:" + hashlib.sha256(canonical).hexdigest(),
        "items": items,
        "skipped": skipped,
    }
    (output / "catalog.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return catalog


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--census", type=Path, default=Path("output/image-census-v1"))
    parser.add_argument("--output", type=Path, default=Path("data/art/release"))
    parser.add_argument("--allow-ssh-am4", action="store_true")
    parser.add_argument("--clean", action="store_true", help="remove an existing output directory before compiling")
    args = parser.parse_args()
    if args.clean and args.output.exists():
        clean_output(args.output)
    catalog = compile_catalog(args.census, args.output, args.allow_ssh_am4)
    print(json.dumps({"catalogHash": catalog["catalogHash"], "items": len(catalog["items"]), "skipped": len(catalog["skipped"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
