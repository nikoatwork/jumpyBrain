import { createAccessStore, type AccessRole } from "../adapters/access-control/index.js";
import { backendStatus, ensureRootBackend, stopRootBackend } from "../app/backend-host/index.js";
import { stringArg, type ParsedCliArgs } from "./args.js";

function validate(args: ParsedCliArgs, allowed: string[]) {
  if (args._.length !== 2) throw new Error("Choose one backend or access operation.");
  for (const key of Object.keys(args)) if (key !== "_" && !allowed.includes(key)) throw new Error(`Unknown flag --${key}.`);
  for (const key of allowed) if (Array.isArray(args[key])) throw new Error(`--${key} must not be repeated.`);
  if (args.json !== undefined && args.json !== true) throw new Error("--json takes no value.");
}
export async function backendCli(args: ParsedCliArgs): Promise<void> {
  if (args._[1] === "list") {
    validate({ ...args, root: "" }, ["root", "json"]);
    const roots = typeof args.root === "string" ? [args.root] : args.root;
    if (!Array.isArray(roots) || roots.length < 1 || roots.length > 32) throw new Error("backend list requires 1..32 explicit --root values.");
    const backends = [];
    for (const root of [...new Set(roots)]) {
      try { const value = await backendStatus(root, true); backends.push({ root, ...value, pidAlive: value.status !== "stopped" }); }
      catch { backends.push({ root, status: "invalid" }); }
    }
    console.log(JSON.stringify({ backends }, null, args.json ? undefined : 2)); return;
  }
  validate(args, ["root", "json"]);
  const root = stringArg(args, "root"), operation = args._[1];
  let result: unknown;
  if (operation === "status") result = await backendStatus(root);
  else if (operation === "stop") result = await stopRootBackend(root);
  else if (operation === "start") { const { token: _secret, ...backend } = await ensureRootBackend(root); result = { status: "running", backend }; }
  else throw new Error("Usage: jumpybrain backend <start|status|stop|list> --root <directory> [--json]");
  console.log(JSON.stringify(result, null, args.json ? undefined : 2));
}
export async function accessCli(args: ParsedCliArgs): Promise<void> {
  const operation = args._[1];
  validate(args, ["root", "target-url", "remote-url", "json", ...(operation === "issue" ? ["name", "role"] : operation === "revoke" ? ["id"] : [])]);
  const selectors = ["root", "target-url", "remote-url"].filter(flag => args[flag] !== undefined);
  if (selectors.length !== 1) throw new Error("access needs exactly one of --root <directory> (on the server) or --target-url <url> (with an admin key).");
  const role = operation === "issue" ? stringArg(args, "role", "writer") : undefined;
  if (role !== undefined && !["reader", "writer", "admin"].includes(role)) throw new Error("--role must be reader, writer or admin.");
  const usage = "Usage: jumpybrain access <issue|list|revoke> (--root <directory> | --target-url <url>) [--name <name> --role reader|writer|admin | --id <credential-id>] [--json]";
  const local = selectors[0] === "root" ? createAccessStore(stringArg(args, "root")) : undefined;
  try {
    let result: unknown;
    if (local) {
      if (operation === "list") result = { credentials: await local.list() };
      else if (operation === "revoke") result = { revoked: await local.revoke(stringArg(args, "id")) };
      // This authorized issuance command is the only output that contains a secret.
      else if (operation === "issue") result = await local.issue({ name: stringArg(args, "name"), role: role as AccessRole });
      else throw new Error(usage);
    } else {
      if (!["list", "revoke", "issue"].includes(operation ?? "")) throw new Error(usage);
      const url = stringArg(args, selectors[0]!);
      const [{ createRemoteAccessClient }, { remoteApiKey }] = await Promise.all([import("../adapters/http-client/access.js"), import("./memory-target.js")]);
      const remote = createRemoteAccessClient({ url, apiKey: await remoteApiKey(url) });
      if (operation === "list") result = await remote.list();
      else if (operation === "revoke") result = await remote.revoke(stringArg(args, "id"));
      else result = await remote.issue({ name: stringArg(args, "name"), role: role as AccessRole });
    }
    console.log(JSON.stringify(result, null, args.json ? undefined : 2));
  } finally { local?.close(); }
}
