/** One dispatcher for shell actions and trusted extension commands. */
export interface BrowserCommand {
  id: string;
  title: string;
  shortcut?: string;
  run(input?: unknown): unknown | Promise<unknown>;
}
export function shortcutMatches(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+").map(part => part.trim());
  const key = parts.pop();
  if (parts.some(part => !["mod", "meta", "ctrl", "alt", "shift"].includes(part)) || (!parts.length && key?.length === 1)) return false;
  if (!key || event.isComposing || event.repeat || event.defaultPrevented) return false;
  if (Boolean(event.altKey) !== parts.includes("alt") || Boolean(event.shiftKey) !== parts.includes("shift")) return false;
  const mod = parts.includes("mod");
  if (mod ? !(event.metaKey || event.ctrlKey) || (event.metaKey && event.ctrlKey)
    : Boolean(event.metaKey) !== parts.includes("meta") || Boolean(event.ctrlKey) !== parts.includes("ctrl")) return false;
  return event.key.toLowerCase() === key;
}
export function createBrowserCommands(onError: (error: unknown) => void = () => {}) {
  const commands = new Map<string, BrowserCommand>();
  return {
    register(command: BrowserCommand) {
      if (commands.has(command.id)) throw new Error("Command already registered: " + command.id);
      commands.set(command.id, command);
      return () => { if (commands.get(command.id) === command) commands.delete(command.id); };
    },
    async execute(id: string, input?: unknown) {
      const command = commands.get(id);
      if (!command) throw new Error("Command is unavailable.");
      return command.run(input);
    },
    shortcut(event: KeyboardEvent) {
      // Stable IDs settle conflicts. Built-in search keeps its reserved chord.
      for (const command of [...commands.values()].sort((a, b) => a.id === "search.open" ? -1 : b.id === "search.open" ? 1 : a.id.localeCompare(b.id))) {
        if (!command.shortcut || !shortcutMatches(event, command.shortcut)) continue;
        event.preventDefault(); event.stopPropagation();
        try { Promise.resolve(command.run()).catch(onError); } catch (error) { onError(error); }
        return true;
      }
      return false;
    },
  };
}
