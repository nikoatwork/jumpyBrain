import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const DEFAULT_URL = "https://huggingface.co/datasets/LIXINYI33/longmemeval-s/resolve/main/longmemeval_s_cleaned.json";
const DEFAULT_OUT = "benchdata/longmemeval/longmemeval_s_cleaned.json";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const url = String(args.url || DEFAULT_URL);
  const out = path.resolve(String(args.out || DEFAULT_OUT));

  try {
    const existing = await stat(out);
    if (!args.force && existing.size > 0) {
      console.log(JSON.stringify({ status: "exists", path: path.relative(process.cwd(), out), bytes: existing.size }, null, 2));
      return;
    }
  } catch {}

  await mkdir(path.dirname(out), { recursive: true });
  console.error(`Downloading LongMemEval-S to ${path.relative(process.cwd(), out)}...`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await pipeline(response.body, createWriteStream(out));
  const downloaded = await stat(out);
  console.log(JSON.stringify({ status: "downloaded", path: path.relative(process.cwd(), out), bytes: downloaded.size }, null, 2));
}
