# Changes

- Serve several hosted brains on one hostname under their own paths, such as `https://brain.example.com/product`. Set the brain's `--public-base-url` with the path and let the proxy strip it; the web UI, live editing, sign-in, CLI named brains and Mac app connections all work under the path. See the VPS deployment guide.
- Smart search is now about as fast as keyword search after its first use. The model stays loaded for 30 minutes after a search, and loads in the background when jumpyBrain starts for a brain with smart search on, so later searches skip loading the model each time. While loaded it uses a few hundred MB of extra memory. Set `JUMPYBRAIN_SMART_SEARCH_IDLE_MS` to change the window (`0` keeps it loaded while jumpyBrain runs).
- Background backends left behind by an update or a removed brain now always exit, so old app versions can be cleaned up.
- `status` for a remote brain no longer suggests smart-search commands that only work on the server's own computer.
