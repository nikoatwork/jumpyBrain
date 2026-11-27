import http from "node:http";
import net from "node:net";

/**
 * A disposable reverse proxy on one loopback origin that serves each target
 * only under its prefix and strips the prefix before forwarding (HTTP and
 * WebSocket upgrades), like Caddy `handle_path /team/*`. Every other path is
 * 404 and recorded in `outside`. `targets` is a URL (served under `prefix`) or
 * a `{ "/prefix": url }` map for several brains on one host.
 */
export async function startPrefixProxy(t, targets, prefix = "/sherpa") {
  const routes = Object.entries(typeof targets === "string" ? { [prefix]: targets } : targets).map(([name, url]) => [name, new URL(url)]);
  const seen = [], outside = [], sockets = new Set();
  const route = (url = "") => {
    for (const [name, upstream] of routes) {
      if (url === name || url.startsWith(name + "?")) return { upstream, path: "/" + url.slice(name.length) };
      if (url.startsWith(name + "/")) return { upstream, path: url.slice(name.length) };
    }
    return null;
  };
  const server = http.createServer((request, response) => {
    const match = route(request.url);
    seen.push(request.url);
    if (!match) { outside.push(request.url); response.writeHead(404).end(); return; }
    const forward = http.request({ host: match.upstream.hostname, port: match.upstream.port, method: request.method, path: match.path, headers: request.headers }, reply => {
      response.writeHead(reply.statusCode, reply.headers);
      reply.pipe(response);
    });
    forward.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(forward);
  });
  server.on("upgrade", (request, socket, head) => {
    const match = route(request.url);
    seen.push(request.url);
    if (!match) { outside.push(request.url); socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
    const connection = net.connect(Number(match.upstream.port), match.upstream.hostname, () => {
      const lines = [`${request.method} ${match.path} HTTP/1.1`];
      for (let index = 0; index < request.rawHeaders.length; index += 2) lines.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
      connection.write(lines.join("\r\n") + "\r\n\r\n");
      if (head?.length) connection.write(head);
      connection.pipe(socket); socket.pipe(connection);
    });
    sockets.add(socket); sockets.add(connection);
    connection.on("error", () => socket.destroy()); socket.on("error", () => connection.destroy());
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { url: origin + routes[0][0], origin, seen, outside };
}
