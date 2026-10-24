# Candy Pink

A playful light palette: strawberry milk backgrounds, raspberry text, rose controls and a confetti-colored graph. It uses the public semantic theme API, including selection, focus and error colors. It has no dependencies or memory permissions.

From a jumpyBrain checkout or unpacked distribution, using a CLI with executable-extension support. Copy the example once to a permanent directory before linking it:

```sh
mkdir -p "$HOME/jumpybrain-extensions"
cp -R ./examples/extensions/candy-pink "$HOME/jumpybrain-extensions/"
jumpybrain extensions install --source "$HOME/jumpybrain-extensions/candy-pink"
```

In the Mac app, open **Settings → Extensions**, then choose **Candy Pink · Strawberry milk** under **Palette**. If the app was already running, use **Reload extensions**. Choose the built-in appearance or disable Candy Pink to return to the standard palette. Your notes and unsaved editor draft stay in place.

The source directory remains linked. Keep it outside the replaceable CLI/app installation and disposable checkouts so upgrades or cleanup do not remove your source. Edit `main.ts` and explicitly reload to see changes; no app rebuild is needed. The manifest's `apiVersion: 1` selects the public extension contract. The factory registers one theme and contains no private host imports or custom CSS.

Only install trusted code: executable extensions run with the desktop host's permissions, even when their capability list is empty. Extension installation and palette preferences are device-local and separate from your Markdown brain. Ordinary hosted browser clients do not load desktop extensions.
