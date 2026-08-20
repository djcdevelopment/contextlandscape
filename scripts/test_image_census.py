#!/usr/bin/env python3
"""Focused tests for the read-only image census."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, PngImagePlugin

sys.path.insert(0, str(Path(__file__).resolve().parent))
import image_census


class FingerprintTests(unittest.TestCase):
    def test_resize_and_webp_roundtrip_remain_perceptually_close(self) -> None:
        image = Image.new("RGB", (160, 120), "#17233c")
        for x in range(20, 140):
            for y in range(15, 105):
                image.putpixel((x, y), ((x * 3) % 255, (y * 2) % 255, (x + y) % 255))
        original_dhash, original_phash, _ = image_census.image_fingerprints(image)
        with tempfile.SpooledTemporaryFile() as buffer:
            image.resize((320, 240)).save(buffer, format="WEBP", quality=86)
            buffer.seek(0)
            with Image.open(buffer) as roundtrip:
                roundtrip_dhash, roundtrip_phash, _ = image_census.image_fingerprints(roundtrip)
        self.assertLessEqual(image_census.hamming_hex(original_dhash, roundtrip_dhash), 4)
        self.assertLessEqual(image_census.hamming_hex(original_phash, roundtrip_phash), 4)

    def test_comfy_prompt_text_is_summarized_without_copying_workflow(self) -> None:
        prompt = {
            "12": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "Context Landscape heavy mech artillery command action"},
            }
        }
        result = image_census.embedded_image_metadata({"prompt": json.dumps(prompt)})
        self.assertEqual(result["keys"], ["prompt"])
        self.assertIn("Context Landscape heavy mech", result["texts"][0])
        self.assertEqual(len(result["sha256"]), 64)


class ScanTests(unittest.TestCase):
    def test_scan_root_records_hash_dimensions_and_embedded_prompt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            png_info = PngImagePlugin.PngInfo()
            png_info.add_text(
                "prompt",
                json.dumps({"1": {"inputs": {"text": "Commander directs a mechanized battlefield action"}}}),
            )
            Image.new("RGB", (48, 32), "#cc8844").save(root / "sample.png", pnginfo=png_info)
            summary, records = image_census.scan_root(
                {
                    "id": "test-root",
                    "path": str(root),
                    "corpus": "comfy-raw",
                    "role": "test",
                },
                "TEST",
                workers=1,
            )
        self.assertEqual(summary["discoveredImages"], 1)
        self.assertEqual(summary["decodeErrors"], 0)
        self.assertEqual(records[0]["width"], 48)
        self.assertEqual(records[0]["height"], 32)
        self.assertEqual(len(records[0]["sha256"]), 64)
        self.assertIn("Commander directs", records[0]["embeddedMetadata"]["texts"][0])


class AnalysisTests(unittest.TestCase):
    @staticmethod
    def record(identifier: str, sha: str, logical_id: str | None, path: str) -> dict:
        return {
            "id": identifier,
            "sha256": sha,
            "logicalId": logical_id,
            "corpus": "main-gallery",
            "host": "TEST",
            "rootId": "test",
            "path": path,
            "role": "test",
        }

    def test_asset_families_join_exact_and_provenance_copies(self) -> None:
        files = [
            self.record("a", "sha-a", "job-1", "/img/job-1.webp"),
            self.record("b", "sha-b", "job-1", "/thumb/job-1.webp"),
            self.record("c", "sha-a", None, "/cache/copy.webp"),
            self.record("d", "sha-d", "job-2", "/img/job-2.webp"),
        ]
        families, family_by_file, summary = image_census.group_asset_families(files)
        self.assertEqual(family_by_file["a"], family_by_file["b"])
        self.assertEqual(family_by_file["a"], family_by_file["c"])
        self.assertNotEqual(family_by_file["a"], family_by_file["d"])
        self.assertEqual(summary["assetFamilies"], 2)
        self.assertEqual(sum(item["physicalFiles"] for item in families), 4)

    def test_explicit_project_metadata_is_confirmed(self) -> None:
        metadata = {
            "project": "context-landscape",
            "campaign": "context-landscape-test",
            "subjectType": "mech",
            "gameUse": "unit-portrait",
            "prompt": "A scout mech executes a combat action",
        }
        score, reasons, _ = image_census.metadata_signals(metadata)
        self.assertEqual(score, 1.0)
        self.assertIn("project=context-landscape", reasons)
        self.assertEqual(image_census.candidate_tier(metadata, score, None), "confirmed")

    def test_index_ids_supports_gallery_and_valheim_shapes(self) -> None:
        self.assertEqual(image_census.index_ids([{"job_id": "a"}]), {"a"})
        self.assertEqual(image_census.index_ids({"images": [{"id": "b"}]}), {"b"})


if __name__ == "__main__":
    unittest.main()
