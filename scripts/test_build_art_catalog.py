import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image

MODULE_PATH = Path(__file__).with_name("build_art_catalog.py")
SPEC = importlib.util.spec_from_file_location("build_art_catalog", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_classification_prefers_explicit_game_use():
    assert MODULE.classify({"gameUse": "commander-portrait", "prompt": "mech battlefield"}) == "commander"
    assert MODULE.classify({"gameUse": "battlefield-background", "prompt": "mech"}) == "battlefield"


def test_external_franchise_tier_is_never_admitted():
    assert "external-franchise-reference" not in MODULE.ALLOWED_TIERS
    assert "external-franchise-reference" in MODULE.EXCLUDED_TIERS


def test_safe_ids_are_url_and_contract_friendly():
    assert MODULE.safe_id({"candidateId": "gallery:Some image/one"}) == "gallery-Some-image-one"


def test_compiles_content_addressed_derivatives_from_a_logical_gallery_family(tmp_path):
    census = tmp_path / "census"
    output = tmp_path / "release"
    census.mkdir()
    source = tmp_path / "source.png"
    Image.new("RGB", (640, 360), (20, 80, 100)).save(source)
    (census / "files.jsonl").write_text(json.dumps({"recordType": "imageFile", "id": "file-1", "host": "OMEN"}) + "\n", encoding="utf-8")
    (census / "asset-families.jsonl").write_text(json.dumps({
        "familyId": "family-1",
        "logicalIds": ["main-gallery:job-1"],
        "locations": [{"fileId": "file-1", "host": "OMEN", "path": str(source), "role": "published-original"}],
    }) + "\n", encoding="utf-8")
    (census / "context-landscape-candidates.jsonl").write_text(json.dumps({
        "candidateId": "gallery:job-1", "jobId": "job-1", "tier": "confirmed", "subjectType": "battlefield", "subjectLabel": "Signal Basin"
    }) + "\n", encoding="utf-8")
    (output / "thumb").mkdir(parents=True)
    (output / "thumb" / "orphan.webp").write_bytes(b"stale")

    catalog = MODULE.compile_catalog(census, output, False)
    assert len(catalog["items"]) == 1
    item = catalog["items"][0]
    assert item["assetId"] == "job-1"
    assert item["familyId"] == "family-1"
    assert item["battlefieldSrc"].startswith("/media/art/battlefield/")
    assert (output / "catalog.json").is_file()
    assert len(list((output / "thumb").glob("*.webp"))) == 1
    assert not (output / "thumb" / "orphan.webp").exists()


def test_clean_refuses_workspace_and_home_roots():
    with pytest.raises(ValueError):
        MODULE.clean_output(Path.cwd())
    with pytest.raises(ValueError):
        MODULE.clean_output(Path.home())


def test_remote_materialization_shell_quotes_the_source_path(tmp_path, monkeypatch):
    remote_path = "/srv/gallery/asset one; touch should-not-run.png"
    captured = []

    def fake_run(arguments, *, stdout, stderr, check):
        captured.append(arguments)
        stdout.write(b"remote-image")
        return type("Completed", (), {"returncode": 0})()

    monkeypatch.setattr(MODULE.subprocess, "run", fake_run)

    materialized = MODULE.materialize(remote_path, "AM4", True, tmp_path)

    assert materialized == tmp_path / "asset one; touch should-not-run.png"
    assert captured == [["ssh", "am4", f"cat -- {MODULE.shlex.quote(remote_path)}"]]
