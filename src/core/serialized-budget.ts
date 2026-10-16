/** Exact wire representation for byte-bounded packets; includes the output framing LF. */
export function serializeBudgetedPacket(packet: unknown): string {
  return JSON.stringify(packet) + "\n";
}

export const MIN_PACKET_MAX_BYTES = 1024;
export const MAX_PACKET_MAX_BYTES = 65536;
export const DEFAULT_PACKET_MAX_BYTES = 8192;

export class PacketBudgetError extends Error {
  constructor(readonly code: "invalid_budget" | "budget_too_small", message: string) {
    super(message);
    this.name = "PacketBudgetError";
  }
}

export function validatePacketMaxBytes(value: number | undefined): number {
  const maxBytes = value === undefined ? DEFAULT_PACKET_MAX_BYTES : value;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < MIN_PACKET_MAX_BYTES || maxBytes > MAX_PACKET_MAX_BYTES) {
    throw new PacketBudgetError("invalid_budget", `maxBytes must be an integer between ${MIN_PACKET_MAX_BYTES} and ${MAX_PACKET_MAX_BYTES}.`);
  }
  return maxBytes;
}

export function packetFits(packet: unknown, maxBytes: number): boolean {
  return Buffer.byteLength(serializeBudgetedPacket(packet), "utf8") <= maxBytes;
}
