export { DEFAULT_EXTENSION_DIRECTORY, installExtension, checkExtension, listExtensions, setExtensionEnabled, removeExtension, prepareExtensions, isExtensionSafeMode, preparedFile, extensionState, leasePreparedExtension, confirmExtensionActivation } from "./registry.js";
export type { ExtensionDirectoryOptions, InstalledExtension, PreparedExtension } from "./registry.js";
export { ExtensionPackageError, assertId, jsonValue, text } from "./validation.js";
