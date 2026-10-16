import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/fake-qmd-lifecycle/", import.meta.url));

// Keep custom query candidates while exercising the pinned transactional SDK
// and readonly SQLite recovery. The package lives outside canonical scanning.
export async function installFakeQmd(root) {
  const pkg = path.join(root, ".jumpybrain", "fake-qmd");
  await cp(fixture, pkg, { recursive: true });
  await copyFile(path.join(pkg, "database.cjs.fixture"), path.join(pkg, "database.cjs"));
  await mkdir(path.join(pkg, "dist"), { recursive: true });
  for (const name of ["index", "store", "llm"]) {
    await copyFile(path.join(pkg, "sdk", `${name}.js.fixture`), path.join(pkg, "dist", `${name}.js`));
  }
  const sqlite = path.join(pkg, "node_modules", "better-sqlite3");
  await mkdir(sqlite, { recursive: true });
  await copyFile(path.join(pkg, "sqlite/package.json"), path.join(sqlite, "package.json"));
  await copyFile(path.join(pkg, "sqlite/index.js.fixture"), path.join(sqlite, "index.js"));
  // Callers write their custom CommonJS query script at the returned bin path.
  const bin = path.join(pkg, "bin", "query.cjs");
  const metadata = JSON.parse(await readFile(path.join(pkg, "package.json"), "utf8"));
  await writeFile(path.join(pkg, "package.json"), JSON.stringify({ ...metadata, bin: { qmd: "bin/query.cjs" } }));
  return { bin, model: path.join(pkg, "model.gguf") };
}

export async function fakeQmdState(root) {
  return JSON.parse(await readFile(path.join(root, ".jumpybrain/qmd-cache/qmd/index.sqlite"), "utf8"));
}

export function activeFakeQmdFiles(state, collection = "jumpybrain") {
  return state.documents.filter(doc => doc.active === 1 && doc.collection === collection).map(doc => doc.file).sort();
}
