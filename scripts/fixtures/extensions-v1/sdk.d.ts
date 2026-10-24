/** Public, host-independent contracts for trusted jumpyBrain extensions. */
export declare const EXTENSION_API_VERSION: 1;
export type Dispose = () => void | Promise<void>;
export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export type ExtensionCapability = "memory.read" | "memory.write";
export type ExtensionSlot = "sidebar.actions" | "note.actions";
export type ExtensionEventName = "document.changed" | "document.saved" | "theme.changed" | "scope.changed";
export interface ExtensionDocument {
    id: string;
    title: string;
}
export interface ExtensionScope {
    generation: number;
    brainId: string;
    tabId: string;
}
export interface ExtensionSearchInput {
    query: string;
    limit?: number;
}
export interface ExtensionSearchResult {
    results: Array<{
        id: string;
        title: string;
        snippet: string;
    }>;
    stale?: boolean;
    partial?: boolean;
}
export interface ExtensionReadResult {
    id: string;
    content: string;
    hash: string;
}
export interface ExtensionCreateInput {
    type: "note";
    title?: string;
    body: string;
    idempotencyKey: string;
}
export interface ExtensionUpdateInput {
    id: string;
    content: string;
    ifMatch: string;
}
export interface ExtensionMemory {
    search(input: ExtensionSearchInput): Promise<ExtensionSearchResult>;
    read(id: string): Promise<ExtensionReadResult>;
    create(input: ExtensionCreateInput): Promise<Json>;
    update(input: ExtensionUpdateInput): Promise<Json>;
}
export interface ExtensionContext {
    readonly signal: AbortSignal;
    readonly scope: ExtensionScope;
    /** UI-supplied current identity/title; not an authenticated canonical document snapshot. */
    readonly document: ExtensionDocument | null;
    readonly memory: ExtensionMemory;
    /** Explicit user-authorized write invocation, still subject to target policy. */
    readonly allowWrites: boolean;
}
export interface ExtensionCommandResult {
    panel?: {
        id: string;
        data: Json;
    };
    message?: string;
}
export interface ExtensionCommand {
    /** Local to this extension; wire identity is extensionId:commandId. */
    id: string;
    title: string;
    shortcut?: string;
    slot?: ExtensionSlot;
    handler(input: Json, context: ExtensionContext): Promise<ExtensionCommandResult | void> | ExtensionCommandResult | void;
}
export interface ExtensionPanel {
    id: string;
    title: string;
}
export interface ExtensionTheme {
    id: string;
    name: string;
    appearance: "light" | "dark";
    colors: Record<string, string>;
}
export interface ExtensionEvent {
    type: ExtensionEventName;
    document?: ExtensionDocument | null;
    theme?: string;
}
export interface ExtensionAPI {
    readonly version: typeof EXTENSION_API_VERSION;
    registerCommand(command: ExtensionCommand): Dispose;
    registerPanel(panel: ExtensionPanel): Dispose;
    registerTheme(theme: ExtensionTheme): Dispose;
    on(type: ExtensionEventName, handler: (event: ExtensionEvent, context: ExtensionContext) => void | Promise<void>): Dispose;
    onDispose(dispose: Dispose): void;
    state: {
        get(key: string): Promise<Json | undefined>;
        set(key: string, value: Json): Promise<void>;
    };
}
export type ExtensionFactory = (api: ExtensionAPI) => void | Dispose | Promise<void | Dispose>;
export interface ExtensionUIContext {
    readonly signal: AbortSignal;
    readonly document: ExtensionDocument | null;
    execute(commandId: string, input?: Json): Promise<ExtensionCommandResult | void>;
    openNote(id: string): Promise<boolean>;
}
export type ExtensionPanelRenderer = (container: HTMLElement, data: Json, context: ExtensionUIContext) => void | Dispose | Promise<void | Dispose>;
export interface ExtensionUIAPI {
    registerPanel(id: string, render: ExtensionPanelRenderer): Dispose;
    onDispose(dispose: Dispose): void;
}
export type ExtensionUIFactory = (api: ExtensionUIAPI) => void | Dispose | Promise<void | Dispose>;
export interface ExtensionManifest {
    apiVersion: 1;
    id: string;
    name: string;
    version: string;
    main: string;
    ui?: string;
    capabilities?: ExtensionCapability[];
}
export interface ExtensionDescriptor {
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    status: "disabled" | "active" | "error";
    error?: string;
    revision: string;
    commands: Array<Omit<ExtensionCommand, "handler">>;
    panels: ExtensionPanel[];
    themes: ExtensionTheme[];
    ui?: string;
    capabilities: ExtensionCapability[];
}
export interface ExtensionSnapshot {
    apiVersion: 1;
    revision: string;
    safeMode: boolean;
    extensions: ExtensionDescriptor[];
}
