#!/usr/bin/env python3
"""Read-only integrity verification for a compiled Context Landscape art catalog."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any, Mapping

from PIL import Image


EXPECTED_CENSUS_HASH = "sha256:928a78fd7f9a6adae62eead18553088aa4d360d338506bac0c73d529fd10369f"
EXPECTED_CATALOG_HASH = "sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae"
EXPECTED_ITEMS = 3_501
EXPECTED_SKIPPED = 0
EXPECTED_KIND_COUNTS = {
    "unit": 1_048,
    "event": 1_868,
    "battlefield": 294,
    "commander": 291,
}
CATALOG_SCHEMA = "context-landscape-art-catalog/v1"
MEDIA_PREFIX = "/media/art/"
DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")


class CatalogVerificationError(ValueError):
    """Raised when a compiled catalog does not match its release contract."""


def canonical_catalog_hash(items: list[dict[str, Any]]) -> str:
    canonical = json.dumps(
        items,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(canonical).hexdigest()


def derivative_path(catalog_root: Path, source: str) -> Path:
    """Resolve one public media path without allowing it to escape catalog_root."""
    if not isinstance(source, str) or not source.startswith(MEDIA_PREFIX):
        raise CatalogVerificationError(
            f"derivative path must start with {MEDIA_PREFIX!r}: {source!r}"
        )
    relative_text = source[len(MEDIA_PREFIX) :]
    relative = PurePosixPath(relative_text)
    if (
        not relative_text
        or relative.is_absolute()
        or "\\" in relative_text
        or any(part in {"", ".", ".."} for part in relative.parts)
        or relative.suffix.lower() != ".webp"
    ):
        raise CatalogVerificationError(f"unsafe derivative path: {source!r}")

    root = catalog_root.resolve()
    candidate = root.joinpath(*relative.parts).resolve()
    if not candidate.is_relative_to(root):
        raise CatalogVerificationError(f"derivative escapes catalog root: {source!r}")
    return candidate


def verify_derivative(catalog_root: Path, source: str) -> Path:
    path = derivative_path(catalog_root, source)
    if not path.is_file():
        raise CatalogVerificationError(f"referenced derivative is missing: {source}")
    if path.stat().st_size <= 0:
        raise CatalogVerificationError(f"referenced derivative is empty: {source}")
    try:
        with Image.open(path) as image:
            image.load()
            if image.format != "WEBP":
                raise CatalogVerificationError(
                    f"referenced derivative is not WebP: {source} ({image.format!r})"
                )
            if image.width <= 0 or image.height <= 0:
                raise CatalogVerificationError(
                    f"referenced derivative has invalid dimensions: {source}"
                )
    except CatalogVerificationError:
        raise
    except Exception as error:
        raise CatalogVerificationError(
            f"referenced derivative is not decodable: {source}: {error}"
        ) from error
    return path


def _require_digest(value: object, label: str) -> str:
    if not isinstance(value, str) or not DIGEST_PATTERN.fullmatch(value):
        raise CatalogVerificationError(f"{label} is not a lowercase sha256 digest: {value!r}")
    return value


def verify_catalog(
    catalog_root: Path,
    *,
    expected_census_hash: str = EXPECTED_CENSUS_HASH,
    expected_catalog_hash: str = EXPECTED_CATALOG_HASH,
    expected_items: int = EXPECTED_ITEMS,
    expected_skipped: int = EXPECTED_SKIPPED,
    expected_kind_counts: Mapping[str, int] = EXPECTED_KIND_COUNTS,
) -> dict[str, Any]:
    """Validate catalog metadata and decode every referenced derivative without writes."""
    root = catalog_root.resolve()
    catalog_path = root / "catalog.json"
    if not catalog_path.is_file():
        raise CatalogVerificationError(f"catalog is missing: {catalog_path}")
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise CatalogVerificationError(f"catalog cannot be read as JSON: {error}") from error
    if not isinstance(catalog, dict):
        raise CatalogVerificationError("catalog root must be a JSON object")
    if catalog.get("schemaVersion") != CATALOG_SCHEMA:
        raise CatalogVerificationError(
            f"schemaVersion expected {CATALOG_SCHEMA!r}, got {catalog.get('schemaVersion')!r}"
        )

    census_hash = _require_digest(catalog.get("censusReportHash"), "censusReportHash")
    if census_hash != expected_census_hash:
        raise CatalogVerificationError(
            f"censusReportHash expected {expected_census_hash!r}, got {census_hash!r}"
        )

    items = catalog.get("items")
    skipped = catalog.get("skipped")
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise CatalogVerificationError("items must be an array of JSON objects")
    if not isinstance(skipped, list):
        raise CatalogVerificationError("skipped must be an array")
    if len(items) != expected_items:
        raise CatalogVerificationError(
            f"item count expected {expected_items}, got {len(items)}"
        )
    if len(skipped) != expected_skipped:
        raise CatalogVerificationError(
            f"skipped count expected {expected_skipped}, got {len(skipped)}"
        )

    kind_counts = Counter(item.get("kind") for item in items)
    if dict(kind_counts) != dict(expected_kind_counts):
        raise CatalogVerificationError(
            f"kind counts expected {dict(expected_kind_counts)!r}, got {dict(kind_counts)!r}"
        )

    asset_ids = [item.get("assetId") for item in items]
    if any(not isinstance(asset_id, str) or not asset_id for asset_id in asset_ids):
        raise CatalogVerificationError("every item must have a non-empty string assetId")
    duplicate_ids = sorted(
        asset_id for asset_id, count in Counter(asset_ids).items() if count > 1
    )
    if duplicate_ids:
        raise CatalogVerificationError(
            f"duplicate assetId values: {', '.join(duplicate_ids[:10])}"
        )

    recorded_hash = _require_digest(catalog.get("catalogHash"), "catalogHash")
    computed_hash = canonical_catalog_hash(items)
    if recorded_hash != computed_hash:
        raise CatalogVerificationError(
            f"catalogHash does not match canonical items: recorded {recorded_hash}, computed {computed_hash}"
        )
    if computed_hash != expected_catalog_hash:
        raise CatalogVerificationError(
            f"catalogHash expected {expected_catalog_hash!r}, got {computed_hash!r}"
        )

    checked_paths: set[Path] = set()
    reference_count = 0
    for item in items:
        asset_id = str(item["assetId"])
        kind = item.get("kind")
        references: list[tuple[str, object]] = [
            ("thumbnailSrc", item.get("thumbnailSrc")),
            ("cardSrc", item.get("cardSrc")),
        ]
        battlefield_source = item.get("battlefieldSrc")
        if kind == "battlefield":
            references.append(("battlefieldSrc", battlefield_source))
        elif battlefield_source is not None:
            raise CatalogVerificationError(
                f"non-battlefield item {asset_id!r} references battlefieldSrc"
            )
        for field, source in references:
            if not isinstance(source, str) or not source:
                raise CatalogVerificationError(
                    f"item {asset_id!r} has no {field} derivative"
                )
            reference_count += 1
            path = derivative_path(root, source)
            if path not in checked_paths:
                verify_derivative(root, source)
                checked_paths.add(path)

    return {
        "status": "pass",
        "catalogRoot": str(root),
        "censusReportHash": census_hash,
        "catalogHash": computed_hash,
        "items": len(items),
        "skipped": len(skipped),
        "kindCounts": dict(sorted(kind_counts.items())),
        "derivativeReferences": reference_count,
        "uniqueDerivatives": len(checked_paths),
    }


def nonnegative_integer(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("expected a non-negative integer")
    return parsed


def digest_argument(value: str) -> str:
    if not DIGEST_PATTERN.fullmatch(value):
        raise argparse.ArgumentTypeError("expected sha256 followed by 64 lowercase hex digits")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-root", type=Path, default=Path("data/art/release"))
    parser.add_argument(
        "--expected-census-hash", type=digest_argument, default=EXPECTED_CENSUS_HASH
    )
    parser.add_argument(
        "--expected-catalog-hash", type=digest_argument, default=EXPECTED_CATALOG_HASH
    )
    parser.add_argument("--expected-items", type=nonnegative_integer, default=EXPECTED_ITEMS)
    parser.add_argument("--expected-skipped", type=nonnegative_integer, default=EXPECTED_SKIPPED)
    for kind, count in EXPECTED_KIND_COUNTS.items():
        parser.add_argument(
            f"--expected-{kind}-items", type=nonnegative_integer, default=count
        )
    args = parser.parse_args(argv)
    expected_kind_counts = {
        kind: getattr(args, f"expected_{kind}_items") for kind in EXPECTED_KIND_COUNTS
    }
    try:
        result = verify_catalog(
            args.catalog_root,
            expected_census_hash=args.expected_census_hash,
            expected_catalog_hash=args.expected_catalog_hash,
            expected_items=args.expected_items,
            expected_skipped=args.expected_skipped,
            expected_kind_counts=expected_kind_counts,
        )
    except CatalogVerificationError as error:
        print(f"ART CATALOG VERIFY FAIL: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
