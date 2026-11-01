import { connect, createServer, isIP, type AddressInfo, type Socket } from "node:net";

/** One private control alias for an already listening foreground backend.
 * It forwards bytes only: HTTP/WS authorization, state and queues remain owned
 * by the original server. It never exposes a second document authority.
 */
export async function startBackendControlProxy(target: Pick<AddressInfo, "address" | "port">, options: { maxConnections?: number; connectTimeoutMs?: number } = {}) {
  if (!isIP(target.address) || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535) throw new Error("A bound TCP backend address is required.");
  const host = target.address === "0.0.0.0" ? "127.0.0.1" : target.address === "::" ? "::1" : target.address;
  const maximum = options.maxConnections ?? 128;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1024) throw new Error("Choose a bounded control connection limit.");
  const sockets = new Set<Socket>();
  let stopping = false, closing: Promise<void> | undefined;
  const server = createServer(incoming => {
    if (stopping) { incoming.destroy(); return; }
    const upstream = connect({ host, port: target.port });
    sockets.add(incoming); sockets.add(upstream);
    let disposed = false;
    const timeout = setTimeout(() => dispose(), options.connectTimeoutMs ?? 3000);
    timeout.unref();
    function dispose() {
      if (disposed) return;
      disposed = true; clearTimeout(timeout);
      sockets.delete(incoming); sockets.delete(upstream);
      incoming.destroy(); upstream.destroy();
    }
    incoming.once("error", dispose); upstream.once("error", dispose);
    incoming.once("close", dispose); upstream.once("close", dispose);
    upstream.once("connect", () => {
      clearTimeout(timeout);
      if (stopping) { dispose(); return; }
      incoming.pipe(upstream); upstream.pipe(incoming);
    });
  });
  server.maxConnections = maximum;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    resourceUsage: () => ({ sockets: sockets.size, maxConnections: maximum }),
    close() {
      if (!closing) {
        stopping = true;
        for (const socket of sockets) socket.destroy();
        closing = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
      return closing;
    },
  };
}
