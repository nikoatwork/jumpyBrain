import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

// Read only bounded, private native control files; no credentials from environment or brain targets.
async function privateFile(filename: string, maximum: number): Promise<string> {
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size > maximum) throw new Error("Unsafe companion control file.");
    const bytes = Buffer.alloc(maximum + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > maximum) throw new Error("Oversized companion control file.");
    return bytes.subarray(0, bytesRead).toString("utf8");
  } finally { await handle.close(); }
}

export async function liveCompanion(support: string, label = "extension management", signal?: AbortSignal): Promise<null | { request(route: string, body?: unknown, generation?: number): Promise<any> }> {
  let descriptor: string;
  try {
    // Check the pointer's existence before requiring a support directory for a fresh install.
    await lstat(path.join(support, "extensions-control.json"));
    const info = await lstat(support);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) throw new Error("Unsafe companion support directory.");
    descriptor = await privateFile(path.join(support, "extensions-control.json"), 4096);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  let packet: any;
  try { packet = JSON.parse(descriptor); } catch { throw new Error("Invalid companion control descriptor."); }
  const canonicalSupport = await realpath(support);
  if (packet?.version !== 1 || packet.directory !== canonicalSupport
    || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(packet.origin) || Number(new URL(packet.origin).port) > 65535
    || !Number.isSafeInteger(packet.pid) || packet.pid < 1) throw new Error("Companion control descriptor does not match this support directory.");
  try { process.kill(packet.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return null; throw error; }
  const key = (await privateFile(path.join(support, "api-key"), 128)).trim();
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error("Invalid native companion control key.");
  return {
    async request(route, body, generation) {
      const response = await fetch(packet.origin + route, {
        method: body === undefined ? "GET" : "POST", redirect: "error", signal: signal ?? AbortSignal.timeout(70000),
        headers: { Authorization: "Bearer " + key, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(generation === undefined ? {} : { "X-Companion-Generation": String(generation) }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(`Companion ${label} failed (${response.status}).`), { status: response.status });
      return result;
    },
  };
}
