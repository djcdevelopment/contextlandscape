import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readGzipJsonLines, writeAtomicJson, writeGzipJsonLines, writeImmutableJson } from "./artifact-io.js";

describe("lab artifact IO", () => {
  it("streams gzip JSONL without materializing the source", async () => {
    const root = await mkdtemp(join(tmpdir(), "attention-artifacts-"));
    const path = join(root, "shard.jsonl.gz");
    async function* records() {
      for (let index = 0; index < 25; index += 1) yield { index, value: `v-${index}` };
    }
    await expect(writeGzipJsonLines(path, records())).resolves.toBe(25);
    const read: unknown[] = [];
    for await (const value of readGzipJsonLines(path)) read.push(value);
    expect(read).toEqual(Array.from({ length: 25 }, (_, index) => ({ index, value: `v-${index}` })));
  });

  it("writes atomic JSON and refuses conflicting historical evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "attention-json-"));
    const atomic = join(root, "atomic.json");
    await writeAtomicJson(atomic, { value: 1 });
    expect(JSON.parse(await readFile(atomic, "utf8"))).toEqual({ value: 1 });

    const immutable = join(root, "immutable.json");
    await writeImmutableJson(immutable, { b: 2, a: 1 });
    await expect(writeImmutableJson(immutable, { a: 1, b: 2 })).resolves.toBeUndefined();
    await expect(writeImmutableJson(immutable, { a: 2, b: 2 })).rejects.toThrow("different content");
  });
});
