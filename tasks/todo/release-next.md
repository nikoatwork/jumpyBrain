# Changes

- Serve several hosted brains on one hostname under their own paths, such as `https://brain.example.com/product`. Set the brain's `--public-base-url` with the path and let the proxy strip it; the web UI, live editing, sign-in, CLI named brains and Mac app connections all work under the path. See the VPS deployment guide.
