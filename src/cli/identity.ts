import { readIdentity, writeIdentity } from "../adapters/client-identity/index.js";
import { stringArg, type ParsedCliArgs } from "./args.js";

export async function identityCli(args: ParsedCliArgs): Promise<void> {
  if (args.help) { console.log('jumpybrain identity [--name "Your name"] [--json]\nAn optional local display name shared with Mac Settings. Use --name "" to clear it.'); return; }
  if (args._.length !== 1 || Object.keys(args).some(key => !["_", "name", "json", "help"].includes(key))) throw new Error("Use jumpybrain identity [--name <name>] [--json].");
  const result = args.name === undefined ? await readIdentity() : await writeIdentity(stringArg(args, "name"));
  console.log(args.json ? JSON.stringify(result) : result.name || "Display name not set.");
}
