# Ember Plum

A trusted executable jumpyBrain extension factory that registers a dark palette through the public `jumpybrain/extensions.js` SDK. No dependencies, native bridge, or application rebuild.

With a locally installed jumpyBrain CLI that includes extension support:

```sh
jumpybrain extensions install --source ./examples/extensions/ember-plum
```

Open the Mac companion's Settings, enable **Ember Plum** if disabled, choose **Ember Plum · Plum** under **Palette**, and use **Reload extensions** after editing `main.ts`. Disable/remove restores the built-in palette and preserves the editor draft. The sidebar appearance toggle returns to built-in Light/Dark. A missing/disabled palette falls back to the current user/System preference. Extension placement, shortcuts and palette choice are device-local preferences.

The compiler resolves the type-only SDK import at authoring time and erases it from the executable bundle. Use the public SDK from the installed `jumpybrain` package for type checking; ordinary TS entries are prepared at install/reload. No package-manager install hook is needed by this example. Only explicitly installed trusted code runs; normal hosted browser clients do not load extensions. A local extension can use the user's OS permissions and is not sandboxed by its capability list.
