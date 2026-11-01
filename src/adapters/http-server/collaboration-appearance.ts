export interface ParticipantAppearance { actor: string; principalId?: string; clientId?: string; name: string; kind: "human" | "agent"; activity?: string }
export function participantAppearance(peer: ParticipantAppearance) {
  let principal = peer.principalId, client = peer.clientId;
  if (!principal || !client) { try { const parts: unknown = JSON.parse(peer.actor); if (Array.isArray(parts)) { principal ??= String(parts[0]); client ??= String(parts[1]); } } catch {} }
  principal ??= peer.actor; client ??= peer.actor;
  const hash = Array.from(principal).reduce((value, char) => (value * 31 + char.codePointAt(0)!) >>> 0, 2166136261);
  const color = `oklch(52% 0.15 ${(hash % 36000) / 100})`;
  const clientHash = Array.from(client).reduce((value, char) => (value * 31 + char.codePointAt(0)!) >>> 0, 2166136261);
  const session = clientHash.toString(36).padStart(7, "0").slice(-6);
  const activity = peer.activity === "streaming" ? "generating" : peer.activity === "editing" ? "editing" : "viewing";
  const name = peer.kind === "agent" ? `Agent ${peer.name}` : peer.name;
  return { color, session, activity, label: `${name} · ${session}`, description: `${name}, ${activity}, session ${session}` };
}
