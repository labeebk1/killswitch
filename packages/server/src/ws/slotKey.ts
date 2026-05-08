import crypto from "crypto";
import { hub } from "./hub";
import type { WebSocket } from "ws";

/**
 * Issue a new random slot key (32-char hex).
 */
export function issueSlotKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Register a slot key in the hub for WS authentication.
 */
export function registerSlotKey(slotKey: string, matchId: string, slot: number): void {
  hub.registerSlotKey(slotKey, matchId, slot);
}

/**
 * Unregister a slot key (e.g. when match ends).
 */
export function unregisterSlotKey(slotKey: string): void {
  hub.unregisterSlotKey(slotKey);
}

/**
 * Kick a slot by sending a kick envelope and closing the WS.
 */
export function kickSlot(matchId: string, slot: number, reason: string): void {
  const ws: WebSocket | null = hub.getSlotWs(matchId, slot);
  if (ws && ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify({ type: "kick", reason }));
    ws.close(4000, reason);
  }
}
