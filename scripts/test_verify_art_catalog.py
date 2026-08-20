import hashlib
import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image


MODULE_PATH = Path(__file__).with_name("verify_art_catalog.py")
SPEC = importlib.util.spec_from_file_location("verify_art_catalog", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def write_webp(path: Path, color: tuple[int, int, int] = (20, 80, 100)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (24, 18), color).save(path, "WEBP")


def make_catalog(root: Path) -> tuple[dict, dict[str, int]]:
    items = []
    kind_counts = {"unit": 1, "event": 1, "battlefield": 1, "commander": 1}
    for index, kind in enumerate(kind_counts):
        stem = f"asset-{index}"
        thumbnail = f"/media/art/thumb/{stem}.webp"
        card = f"/media/art/card/{stem}.webp"
        write_webp(root / thumbnail.removeprefix("/media/art/"), (index * 20, 50, 80))
        write_webp(root / card.removeprefix("/media/art/"), (index * 20, 60, 90))
        battlefield = None
        if kind == "battlefield":
            battlefield = f"/media/art/battlefield/{stem}.webp"
            write_webp(root / battlefield.removeprefix("/media/art/"), (40, 70, 100))
        items.append(
            {
                "schemaVersion": 1,
                "assetId": stem,
                "familyId": f"family-{index}",
                "contentHash": "sha256:" + hashlib.sha256(stem.encode()).hexdigest(),
                "tier": "confirmed",
                "kind": kind,
                "title": stem.title(),
                "alt": stem,
                "subjects": [kind],
                "aspect": "landscape",
                "focalPoint": {"x": 50, "y": 45},
                "thumbnailSrc": thumbnail,
                "cardSrc": card,
                "battlefieldSrc": battlefield,
                "experimental": False,
            }
        )
    catalog = {
        "schemaVersion": MODULE.CATALOG_SCHEMA,
        "censusReportHash": MODULE.EXPECTED_CENSUS_HASH,
        "catalogHash": MODULE.canonical_catalog_hash(items),
        "items": items,
        "skipped": [],
    }
    (root / "catalog.json").write_text(
        json.dumps(catalog, indent=2) + "\n", encoding="utf-8"
    )
    return catalog, kind_counts


def verify_fixture(root: Path, catalog: dict, kind_counts: dict[str, int]):
    return MODULE.verify_catalog(
        root,
        expected_catalog_hash=catalog["catalogHash"],
        expected_items=4,
        expected_skipped=0,
        expected_kind_counts=kind_counts,
    )


def test_verifies_canonical_hash_counts_and_every_derivative(tmp_path):
    catalog, kind_counts = make_catalog(tmp_path)

    result = verify_fixture(tmp_path, catalog, kind_counts)

    assert result["status"] == "pass"
    assert result["catalogHash"] == catalog["catalogHash"]
    assert result["derivativeReferences"] == 9
    assert result["uniqueDerivatives"] == 9


def test_rejects_item_tampering_even_when_recorded_hash_is_unchanged(tmp_path):
    catalog, kind_counts = make_catalog(tmp_path)
    catalog["items"][0]["title"] = "Tampered"
    (tmp_path / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")

    with pytest.raises(MODULE.CatalogVerificationError, match="canonical items"):
        verify_fixture(tmp_path, catalog, kind_counts)


@pytest.mark.parametrize("failure", ["missing", "empty", "corrupt"])
def test_rejects_missing_empty_or_undecodable_derivatives(tmp_path, failure):
    catalog, kind_counts = make_catalog(tmp_path)
    target = tmp_path / "thumb" / "asset-0.webp"
    if failure == "missing":
        target.unlink()
    elif failure == "empty":
        target.write_bytes(b"")
    else:
        target.write_bytes(b"not-a-webp")

    with pytest.raises(MODULE.CatalogVerificationError, match=failure if failure != "corrupt" else "not decodable"):
        verify_fixture(tmp_path, catalog, kind_counts)


def test_rejects_derivative_path_traversal_before_reading(tmp_path):
    catalog, kind_counts = make_catalog(tmp_path)
    catalog["items"][0]["thumbnailSrc"] = "/media/art/../outside.webp"
    catalog["catalogHash"] = MODULE.canonical_catalog_hash(catalog["items"])
    (tmp_path / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")

    with pytest.raises(MODULE.CatalogVerificationError, match="unsafe derivative path"):
        verify_fixture(tmp_path, catalog, kind_counts)


def test_rejects_expected_kind_count_drift(tmp_path):
    catalog, kind_counts = make_catalog(tmp_path)
    wrong_counts = {**kind_counts, "event": 2}

    with pytest.raises(MODULE.CatalogVerificationError, match="kind counts expected"):
        MODULE.verify_catalog(
            tmp_path,
            expected_catalog_hash=catalog["catalogHash"],
            expected_items=4,
            expected_kind_counts=wrong_counts,
        )
