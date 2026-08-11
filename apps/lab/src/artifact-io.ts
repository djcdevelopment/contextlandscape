import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { createInterface } from "node:readline";
import { canonicalJson } from "./provenance.js";

export async function writeGzipJsonLines<T>(path: string, values: AsyncIterable<T> | Iterable<T>): Promise<number> {
  await mkdir(dirname(path), { recursive: true });
  let count = 0;
  async function* lines(): AsyncGenerator<string> {
    for await (const value of values) {
      count += 1;
      yield `${JSON.stringify(value)}\n`;
    }
  }
  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(path, { flags: "wx" }));
  return count;
}

export async function* readGzipJsonLines(path: string): AsyncGenerator<unknown> {
  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length > 0) yield JSON.parse(line);
  }
}

export async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, path);
}

export async function writeImmutableJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (canonicalJson(existing) !== canonicalJson(value)) {
      throw new Error(`Historical evidence already exists with different content: ${path}`);
    }
  }
}
