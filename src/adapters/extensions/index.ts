export { DEFAULT_EXTENSION_DIRECTORY, installExtension, listExtensions, setExtensionEnabled, removeExtension, prepareExtensions, isExtensionSafeMode, preparedFile, extensionState, leasePreparedExtension } from "./registry.js";
export type { ExtensionDirectoryOptions, InstalledExtension, PreparedExtension } from "./registry.js";
export { ExtensionPackageError, assertId, jsonValue, text } from "./validation.js";
