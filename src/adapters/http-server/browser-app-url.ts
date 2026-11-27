// A hosted brain may be published under a path prefix (e.g. https://host/sherpa/)
// by a reverse proxy that strips the prefix, so the server still routes `/`,
// `/graph`, `/memories/...` and `/ws`. The page learns the public base path once
// and builds every app URL through `appUrl`; see browser.docs.md#app-urls.

// "" or "/segment[/segment]": leading slash, no trailing slash, no dot segments,
// and nothing that needs escaping inside an HTML attribute or a script string.
const BROWSER_BASE_PATH = /^(?:\/(?!\.\.?(?:\/|$))[A-Za-z0-9._~!$()*+,;=:@%-]+)*$/;

export function browserBasePath(value: unknown = ""): string {
  // "/graph" would be indistinguishable from the app's own Graph route.
  if (typeof value !== "string" || !BROWSER_BASE_PATH.test(value) || value === "/graph") {
    throw new Error("browser base path must be empty or /segment[/segment] without a trailing slash");
  }
  return value;
}

// Inline-script prelude shared by every browser module composed into the shell.
// `appUrl("/memories/all")` -> "/sherpa/memories/all"; `appRoute(location.pathname)`
// strips the base again. App routes are root-relative ("/", "/graph", "/?note=…");
// only strings that start with exactly one "/" are rewritten.
export function appUrlScript(basePath: string): string {
  return `const appBasePath = ${JSON.stringify(browserBasePath(basePath))};
function appUrl(route) { return appBasePath && typeof route === "string" && route.startsWith("/") && !route.startsWith("//") ? appBasePath + route : route; }
function appRoute(path) { if (!appBasePath || typeof path !== "string") return path; if (path === appBasePath) return "/"; return path.startsWith(appBasePath + "/") ? path.slice(appBasePath.length) : path; }
`;
}
