// Check the documentation bundle. Use --browser for SVG geometry and gallery checks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, SCENES, SIZES, renderScene, gallery } from "./render-wireframes.mjs";

const repo = resolve(ROOT, "../..");
const docs = (await readdir(ROOT)).filter(name => name.endsWith(".md"));
const report = { documents: docs.length, localLinks: 0, figures: 0, sourceFingerprints: 0 };
const headings = value => [...value.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match =>
  match[1].toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-"));

async function localLink(from, href) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
  const [path, anchor] = href.split("#");
  const target = path ? resolve(dirname(from), decodeURIComponent(path.split("?")[0])) : from;
  await access(target).catch(() => assert.fail("Missing link from " + from + ": " + href));
  if (anchor && extname(target) === ".md") {
    assert.ok(headings(await readFile(target, "utf8")).includes(decodeURIComponent(anchor)),
      "Missing heading: " + href);
  }
  report.localLinks++;
}

for (const name of docs) {
  const path = join(ROOT, name), content = await readFile(path, "utf8");
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) await localLink(path, match[1]);
}
const html = await readFile(join(ROOT, "index.html"), "utf8");
assert.equal(html, gallery(), "Gallery is stale; run render-wireframes.mjs");
for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) await localLink(join(ROOT, "index.html"), match[1]);
const existing = (await readdir(join(ROOT, "wireframes"))).filter(name => name.endsWith(".svg"));
assert.equal(existing.length, SCENES.length * SIZES.length);
for (const scene of SCENES) for (const [w, h] of SIZES) {
  const path = join(ROOT, "wireframes", scene.id + "-" + w + "x" + h + ".svg");
  const svg = await readFile(path, "utf8");
  assert.equal(svg, renderScene(scene, w, h), "Figure is stale: " + path);
  assert.ok(svg.includes('aria-labelledby="title desc"'));
  assert.match(svg, /<title id="title">[^<]+<\/title>/);
  assert.match(svg, /<desc id="desc">[^<]+<\/desc>/);
  report.figures++;
}
const examples = JSON.parse(await readFile(join(ROOT, "example-results.json"), "utf8"));
assert.equal(examples.checks.length, 22);
assert.ok(examples.checks.every(check => check.status === "passed"));
for (const [path, expected] of Object.entries(examples.sources)) {
  const actual = "sha256:" + createHash("sha256").update(await readFile(join(repo, path))).digest("hex");
  assert.equal(actual, expected, "Rules/source changed; review and rerun examples: " + path);
  report.sourceFingerprints++;
}

if (process.argv.includes("--browser")) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    report.browser = { svgDocuments: 0, textNodes: 0, gallerySelections: 0, viewports: [] };
    for (const scene of SCENES) for (const [width, height] of SIZES) {
      const name = scene.id + "-" + width + "x" + height;
      await page.setViewportSize({ width, height });
      await page.goto(pathToFileURL(join(ROOT, "wireframes", name + ".svg")).href);
      const audit = await page.evaluate(() => {
        const svg = document.querySelector("svg");
        if (!svg || document.querySelector("parsererror")) return { error: "Invalid SVG document" };
        const width = Number(svg.getAttribute("width")), height = Number(svg.getAttribute("height"));
        const boxes = [...svg.querySelectorAll("text")].map(el => {
          const box = el.getBBox();
          return { text: el.textContent, x: box.x, y: box.y, w: box.width, h: box.height };
        });
        const overflow = boxes.filter(b => b.x < -.1 || b.y < -.1 || b.x+b.w > width+.1 || b.y+b.h > height+.1);
        const overlaps = [];
        for (let i=0; i<boxes.length; i++) for (let j=i+1; j<boxes.length; j++) {
          const a=boxes[i], b=boxes[j];
          const horizontal=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
          const vertical=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
          if (horizontal>2 && vertical>3) overlaps.push([a.text,b.text]);
        }
        return { textNodes: boxes.length, overflow, overlaps };
      });
      assert.ok(!audit.error, name + ": " + audit.error);
      assert.deepEqual(audit.overflow, [], name + " text outside viewport");
      assert.deepEqual(audit.overlaps, [], name + " overlapping text");
      report.browser.svgDocuments++;
      report.browser.textNodes += audit.textNodes;
    }
    await page.goto(pathToFileURL(join(ROOT, "index.html")).href);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.selectOption("#size", width + "x" + height);
      for (const scene of SCENES) {
        await page.selectOption("#scene", scene.id);
        const expected = scene.id + "-" + width + "x" + height + ".svg";
        await page.waitForFunction(expected => {
          const img = document.getElementById("drawing");
          return img.src.endsWith(expected) && img.complete && img.naturalWidth > 0;
        }, expected);
        const state = await page.evaluate(() => {
          const img = document.getElementById("drawing");
          return {
            width: img.naturalWidth, height: img.naturalHeight, alt: img.alt,
            direct: document.getElementById("direct").href,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(state.width, width);
        assert.equal(state.height, height);
        assert.ok(state.direct.endsWith(expected));
        assert.ok(state.alt.includes(scene.title));
        assert.equal(state.overflow, false, "Gallery page overflow");
        report.browser.gallerySelections++;
      }
      await page.click("#scale");
      assert.equal(await page.getAttribute("#scale", "aria-pressed"), "true");
      await page.click("#scale");
      assert.equal(await page.getAttribute("#scale", "aria-pressed"), "false");
      report.browser.viewports.push(width + "x" + height);
    }
    assert.deepEqual(errors, [], "Browser script errors");
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify(report, null, 2));
