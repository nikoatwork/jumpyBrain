export function normalizeRemoteTargetOrigin(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Remote target URL must be a non-empty HTTP(S) URL.");
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw new Error(`Invalid remote target URL ${JSON.stringify(value)}.`, { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Remote target URL must use HTTP or HTTPS: ${JSON.stringify(value)}.`);
  }
  if (url.username || url.password) {
    throw new Error(`Remote target URL must not contain embedded credentials: ${JSON.stringify(value)}.`);
  }

  return url.origin;
}
