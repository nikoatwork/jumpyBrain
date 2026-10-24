// Frozen v1 consumers must remain accepted by the current SDK. Add baselines; do not rewrite v1.
import type * as V1 from "./sdk.js";
import * as Current from "../../../extensions.js";
declare const oldFactory: V1.ExtensionFactory;
declare const oldUI: V1.ExtensionUIFactory;
declare const currentAPI: Current.ExtensionAPI;
declare const currentUI: Current.ExtensionUIAPI;
declare const oldManifest: V1.ExtensionManifest;
const factory: Current.ExtensionFactory = oldFactory;
const ui: Current.ExtensionUIFactory = oldUI;
const api: V1.ExtensionAPI = currentAPI;
const uiAPI: V1.ExtensionUIAPI = currentUI;
const manifest: Current.ExtensionManifest = oldManifest;
const version: 1 = Current.EXTENSION_API_VERSION;
void [factory, ui, api, uiAPI, manifest, version];
