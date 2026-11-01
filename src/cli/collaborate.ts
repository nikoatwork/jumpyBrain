import { randomUUID } from "node:crypto";
import { WebSocket } from "../adapters/websocket/index.js";
import { ensureRootBackend } from "../app/backend-host/index.js";
import { resolveCliTarget } from "./targets.js";
import { createLocalMemoryTransport } from "./local-transport.js";
import type { ParsedCliArgs } from "./args.js";

const usage =
  "jumpybrain collaborate <open|watch|edit|stream|status|cancel|finish|undo|resync> --id <note-id> [--root <directory> | --target-url <https-origin>] [--start <UTF-16 offset> --delete <count> --epoch <read epoch> --base-revision <read revision>] [--json]. Edit offsets and positioned streams require the epoch/revision returned by the read used to calculate them. A stream without --start appends to the latest saved document. Pipe replacement text to edit, or generated UTF-8 chunks to stream. Publishing requires a connection; a lost acknowledgement is never retried automatically.";

export async function collaborateCli(args: ParsedCliArgs): Promise<void> {
  if (args.help) {
    console.log(usage);
    return;
  }
  const operation = args._[1];
  const allowed = new Set([
    "_",
    "id",
    "root",
    "target-url",
    "remote-url",
    "start",
    "delete",
    "epoch",
    "base-revision",
    "client-id",
    "stream-id",
    "json",
  ]);
  if (
    args._.length !== 2 ||
    ![
      "open",
      "watch",
      "edit",
      "stream",
      "status",
      "cancel",
      "finish",
      "undo",
      "resync",
    ].includes(operation)
  )
    throw new Error(usage);
  for (const [key, value] of Object.entries(args))
    if (!allowed.has(key) || (Array.isArray(value) && key !== "_"))
      throw new Error("Unknown or repeated collaboration argument.");
  if (typeof args.id !== "string") throw new Error("--id is required.");
  for (const key of ["start", "delete", "base-revision"])
    if (
      args[key] !== undefined &&
      (typeof args[key] !== "string" ||
        !/^\d+$/.test(args[key] as string) ||
        !Number.isSafeInteger(Number(args[key])))
    )
      throw new Error(`--${key} must be a nonnegative integer.`);
  if (
    !["edit", "stream"].includes(operation) &&
    (args.start !== undefined || args.delete !== undefined)
  )
    throw new Error("Offsets apply only to edit or stream.");
  if (operation !== "edit" && args.delete !== undefined)
    throw new Error("--delete applies only to edit; streaming inserts chunks.");
  const positioned = operation === "edit" || (operation === "stream" && args.start !== undefined);
  const hasReadVersion = args.epoch !== undefined || args["base-revision"] !== undefined;
  if (positioned && (typeof args.epoch !== "string" || !args.epoch.trim() || args.epoch.length > 256 || args["base-revision"] === undefined))
    throw new Error("Positioned edits require --epoch and --base-revision from the actual collaborate open read used to calculate their offsets. Reopening must not relabel old offsets with a fresh revision.");
  if (!positioned && hasReadVersion)
    throw new Error("Read versions apply only to edit or stream with an explicit --start.");
  if (
    ["status", "cancel", "finish"].includes(operation) &&
    typeof args["stream-id"] !== "string"
  )
    throw new Error(
      "--stream-id is required for stream status, cancellation or completion.",
    );
  if (
    args["stream-id"] !== undefined &&
    (!["stream", "status", "cancel", "finish"].includes(operation) ||
      typeof args["stream-id"] !== "string" ||
      !(args["stream-id"] as string).trim() ||
      (args["stream-id"] as string).length > 256)
  )
    throw new Error("Use a bounded --stream-id with a streaming operation.");
  if (args.json !== undefined && args.json !== true)
    throw new Error("--json takes no value.");
  const target = resolveCliTarget(args, { allowDiscovery: true });
  let url: string, credential: string;
  if (target.kind === "local") {
    const backend = await ensureRootBackend(
      target.root ?? (await createLocalMemoryTransport().findMemoryRoot()),
    );
    url = backend.url;
    credential = backend.token;
  } else {
    url = target.url;
    credential = process.env.JUMPYBRAIN_API_KEY?.trim() ?? "";
    if (!credential) throw new Error("JUMPYBRAIN_API_KEY is required.");
  }
  const endpoint = new URL("/ws", url);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(endpoint);
  const pending = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let watch = false,
    clientId = "",
    stoppingError: Error | undefined,
    finishing = false;
  let activeStream:
    | { base: Record<string, unknown>; epoch: string; streamId: string }
    | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined,
    heartbeatTask: Promise<void> | undefined;
  const stopInput = (error: Error) => {
    if (!stoppingError) stoppingError = error;
    process.stdin.destroy(stoppingError);
  };
  const stdinError = () => {};
  process.stdin.on("error", stdinError);
  const print = (snapshot: any) =>
    console.log(
      JSON.stringify(
        args.json
          ? snapshot
          : {
              documentId: snapshot.documentId,
              clientId: snapshot.clientId,
              epoch: snapshot.epoch,
              revision: snapshot.revision,
              saved: snapshot.saved,
              conflict: snapshot.conflict,
              stream: snapshot.stream,
            },
      ),
    );
  socket.addEventListener("message", (event) => {
    let packet: any;
    try {
      packet = JSON.parse(String(event.data));
    } catch {
      socket.close();
      return;
    }
    if (packet.id && pending.has(packet.id)) {
      const waiter = pending.get(packet.id)!;
      pending.delete(packet.id);
      clearTimeout(waiter.timer);
      packet.ok
        ? waiter.resolve(packet.result)
        : waiter.reject(
            Object.assign(
              new Error(packet.error?.message ?? "Live request failed."),
              packet.error,
            ),
          );
    } else if (watch && packet.event === "document") print(packet.snapshot);
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new Error(
          "Connection lost. A dispatched operation may have committed; inspect the note before retrying.",
        ),
      );
    }
    pending.clear();
    if (activeStream && !finishing)
      stopInput(
        new Error(
          "Connection lost while streaming. Confirmed chunks remain saved; inspect stream status before retrying.",
        ),
      );
  });
  const request = (method: string, params: object) =>
    new Promise<any>((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error("The backend is disconnected."));
        return;
      }
      const id = randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            "Acknowledgement timed out. Inspect canonical state before retrying.",
          ),
        );
        socket.close();
      }, 30_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const interrupted = (signal: string) => {
    stopInput(
      new Error(
        signal + ": streaming interrupted. Confirmed chunks remain saved.",
      ),
    );
    if (!activeStream) socket.terminate();
  };
  const sigint = () => interrupted("SIGINT"),
    sigterm = () => interrupted("SIGTERM");
  process.once("SIGINT", sigint);
  process.once("SIGTERM", sigterm);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("Backend connection timed out."));
      }, 10_000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("Could not connect to the backend."));
        },
        { once: true },
      );
    });
    await request("hello", { token: credential, protocol: 2 });
    clientId =
      typeof args["client-id"] === "string"
        ? args["client-id"]
        : process.env.JUMPYBRAIN_CLIENT_ID?.trim() || randomUUID();
    if (!clientId || clientId.length > 128)
      throw new Error("--client-id must contain 1–128 characters.");
    const base = { documentId: args.id, clientId, actorKind: "agent" };
    let snapshot = await request("open", base);
    if (operation === "open") {
      print({ ...snapshot, clientId });
      return;
    }
    if (operation === "watch") {
      watch = true;
      print({ ...snapshot, clientId });
      await new Promise<void>((resolve) =>
        socket.addEventListener("close", () => resolve(), { once: true }),
      );
      return;
    }
    const version = {
      ...base,
      epoch: positioned ? args.epoch as string : snapshot.epoch,
      baseRevision: positioned ? Number(args["base-revision"]) : snapshot.revision,
    };
    if (["status", "cancel", "finish"].includes(operation))
      snapshot = await request("stream." + operation, {
        ...version,
        streamId: args["stream-id"],
      });
    else if (operation === "undo" || operation === "resync")
      snapshot = await request(operation, {
        ...version,
        operationId: randomUUID(),
      });
    else if (operation === "edit") {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of process.stdin) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 2 * 1024 * 1024)
          throw new Error("Edit exceeds the 2 MiB live limit.");
        chunks.push(buffer);
      }
      snapshot = await request("edit", {
        ...version,
        operationId: randomUUID(),
        start: Number(args.start ?? 0),
        deleteCount: Number(args.delete ?? 0),
        insert: new TextDecoder("utf-8", { fatal: true }).decode(
          Buffer.concat(chunks),
        ),
      });
    } else {
      const streamId =
        typeof args["stream-id"] === "string"
          ? args["stream-id"]
          : randomUUID();
      let sequence = 0;
      snapshot = await request("stream.start", {
        ...version,
        streamId,
        start: Number(args.start ?? snapshot.body.length),
      });
      activeStream = { base, epoch: snapshot.epoch, streamId };
      heartbeat = setInterval(() => {
        if (heartbeatTask || !activeStream || stoppingError || finishing)
          return;
        heartbeatTask = request("stream.status", {
          ...activeStream.base,
          epoch: activeStream.epoch,
          streamId: activeStream.streamId,
        })
          .then((status) => {
            if (activeStream && !finishing && status.stream?.state !== "active")
              stopInput(
                new Error(
                  "The stream is no longer active. Confirmed chunks remain saved.",
                ),
              );
          })
          .catch((error) => {
            if (activeStream && !finishing)
              stopInput(
                error instanceof Error
                  ? error
                  : new Error("Stream heartbeat failed."),
              );
          })
          .finally(() => {
            heartbeatTask = undefined;
          });
      }, 15_000);
      heartbeat.unref();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      for await (const chunk of process.stdin) {
        if (stoppingError) throw stoppingError;
        const text = decoder.decode(chunk, { stream: true });
        // Bound individual operations even when the producer writes a very large chunk.
        for (let offset = 0; offset < text.length; ) {
          if (stoppingError) throw stoppingError;
          let end = Math.min(text.length, offset + 8192);
          if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
          const insert = text.slice(offset, end);
          offset = end;
          snapshot = await request("stream.chunk", {
            ...base,
            epoch: snapshot.epoch,
            streamId,
            sequence: sequence++,
            insert,
          });
          if (stoppingError) throw stoppingError;
        }
      }
      if (stoppingError) throw stoppingError;
      const tail = decoder.decode();
      if (tail)
        snapshot = await request("stream.chunk", {
          ...base,
          epoch: snapshot.epoch,
          streamId,
          sequence: sequence++,
          insert: tail,
        });
      if (stoppingError) throw stoppingError;
      finishing = true;
      snapshot = await request("stream.finish", {
        ...base,
        epoch: snapshot.epoch,
        streamId,
      });
      activeStream = undefined;
    }
    if (stoppingError) throw stoppingError;
    print({ ...snapshot, clientId });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (activeStream && socket.readyState === WebSocket.OPEN) {
      finishing = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const confirmed = await Promise.race([
          request("stream.cancel", {
            ...activeStream.base,
            epoch: activeStream.epoch,
            streamId: activeStream.streamId,
          }).then(
            () => true,
            () => false,
          ),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), 2000);
          }),
        ]);
        if (!confirmed && stoppingError)
          stoppingError.message +=
            " Cancellation was not confirmed; inspect stream status before retrying.";
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    activeStream = undefined;
    socket.terminate();
    process.off("SIGINT", sigint);
    process.off("SIGTERM", sigterm);
    process.stdin.off("error", stdinError);
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
  }
}
