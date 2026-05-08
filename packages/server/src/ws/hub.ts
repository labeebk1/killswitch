import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { ClientEnvelopeSchema } from "@killswitch/shared";
import type { ServerEnvelope } from "@killswitch/shared";
import { nanoid } from "nanoid";

export interface SlotState {
  ws: WebSocket | null;
  disconnectedAt: number | null;
  pendingAck: Map<string, string>; // envelopeId → serialised envelope
}

export interface MatchRoom {
  viewers: Set<WebSocket>;
  slots: Map<number, SlotState>;
}

// Slot reconnect grace period (ms)
const RECONNECT_GRACE_MS = 30_000;

class WsHub {
  private rooms = new Map<string, MatchRoom>();
  private wss: WebSocketServer | null = null;

  // Map slotKey → { matchId, slot } for auth
  private slotKeyIndex = new Map<string, { matchId: string; slot: number }>();

  registerSlotKey(slotKey: string, matchId: string, slot: number): void {
    this.slotKeyIndex.set(slotKey, { matchId, slot });
  }

  unregisterSlotKey(slotKey: string): void {
    this.slotKeyIndex.delete(slotKey);
  }

  getRoom(matchId: string): MatchRoom | undefined {
    return this.rooms.get(matchId);
  }

  ensureRoom(matchId: string): MatchRoom {
    let room = this.rooms.get(matchId);
    if (!room) {
      room = { viewers: new Set(), slots: new Map() };
      this.rooms.set(matchId, room);
    }
    return room;
  }

  attach(httpServer: Server): void {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
      const url = new URL(req.url ?? "/", "ws://localhost");
      const pathname = url.pathname;

      // WS connections for CLI: /ws/match/:matchId
      const matchPath = pathname.match(/^\/ws\/match\/([^/]+)$/);
      if (!matchPath) {
        socket.destroy();
        return;
      }
      const matchId = matchPath[1];
      const slotKey = url.searchParams.get("slotKey") ?? extractBearer(req);
      if (!slotKey) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const info = this.slotKeyIndex.get(slotKey);
      if (!info || info.matchId !== matchId) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.handleCliConnection(ws, info.matchId, info.slot);
      });
    });

    this.wss.on("error", (err) => {
      process.stderr.write(`[hub] wss error: ${String(err)}\n`);
    });
  }

  private handleCliConnection(ws: WebSocket, matchId: string, slot: number): void {
    const room = this.ensureRoom(matchId);
    const existing = room.slots.get(slot);

    // Kick existing connection if present
    if (existing?.ws && existing.ws.readyState === WebSocket.OPEN) {
      this.sendEnvelope(existing.ws, { type: "kick", reason: "new_connection" });
      existing.ws.close(4000, "replaced");
    }

    const slotState: SlotState = existing ?? {
      ws: null,
      disconnectedAt: null,
      pendingAck: new Map(),
    };
    slotState.ws = ws;
    slotState.disconnectedAt = null;
    room.slots.set(slot, slotState);

    // Replay pending ack envelopes if within grace window
    const wasRecent =
      existing?.disconnectedAt != null &&
      Date.now() - existing.disconnectedAt < RECONNECT_GRACE_MS;
    if (wasRecent && slotState.pendingAck.size > 0) {
      for (const serialised of slotState.pendingAck.values()) {
        ws.send(serialised);
      }
    }

    // Broadcast reconnect
    const reconnectTs = new Date().toISOString();
    this.broadcastToViewers(matchId, {
      type: "match.slot_reconnected",
      matchId,
      slot,
      ts: reconnectTs,
    });

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        process.stderr.write(`[hub] invalid JSON from slot ${slot} of match ${matchId}\n`);
        ws.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
        return;
      }

      const result = ClientEnvelopeSchema.safeParse(parsed);
      if (!result.success) {
        process.stderr.write(
          `[hub] envelope validation error from slot ${slot}: ${result.error.message}\n`
        );
        ws.send(
          JSON.stringify({ type: "error", message: "invalid envelope", issues: result.error.issues })
        );
        return;
      }

      const envelope = result.data;

      // Tunnel responses are handled by the proxy; don't fan-out to viewers
      if (
        envelope.type === "tunnel.response" ||
        envelope.type === "tunnel.ws_frame" ||
        envelope.type === "tunnel.ws_close"
      ) {
        // Emit type-specific event so proxy can distinguish frame vs close vs response
        this.emit(`${envelope.type}:${envelope.requestId}`, envelope);
        return;
      }

      // cli.connect — no broadcast needed, just acknowledge
      if (envelope.type === "cli.connect") {
        return;
      }

      // All other CLI envelopes fan-out to viewers
      this.broadcastToViewers(matchId, envelope as unknown as ServerEnvelope);
    });

    ws.on("close", () => {
      const state = room.slots.get(slot);
      if (state && state.ws === ws) {
        state.ws = null;
        state.disconnectedAt = Date.now();
        const ts = new Date().toISOString();
        this.broadcastToViewers(matchId, {
          type: "match.slot_disconnected",
          matchId,
          slot,
          ts,
          lastSeenAt: ts,
        });
      }
    });

    ws.on("error", (err) => {
      process.stderr.write(`[hub] ws error slot ${slot} match ${matchId}: ${String(err)}\n`);
    });
  }

  // ─── Event emitter for tunnel proxy ──────────────────────────────────────

  private listeners = new Map<string, Set<(data: unknown) => void>>();

  on(event: string, cb: (data: unknown) => void): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
  }

  off(event: string, cb: (data: unknown) => void): void {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  // ─── Public send helpers ──────────────────────────────────────────────────

  sendToSlot(matchId: string, slot: number, envelope: ServerEnvelope): void {
    const room = this.rooms.get(matchId);
    const state = room?.slots.get(slot);
    if (!state?.ws || state.ws.readyState !== WebSocket.OPEN) return;
    const id = nanoid();
    const serialised = JSON.stringify({ ...envelope, _id: id });
    state.pendingAck.set(id, serialised);
    state.ws.send(serialised, () => {
      // Remove from pendingAck once delivered (fire-and-forget ack)
      state.pendingAck.delete(id);
    });
  }

  sendEnvelope(ws: WebSocket, envelope: ServerEnvelope | { type: string; [k: string]: unknown }): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
    }
  }

  broadcastToViewers(matchId: string, envelope: ServerEnvelope): void {
    const room = this.rooms.get(matchId);
    if (!room) return;
    const serialised = JSON.stringify(envelope);
    for (const viewer of room.viewers) {
      if (viewer.readyState === WebSocket.OPEN) {
        viewer.send(serialised);
      }
    }
  }

  addViewer(ws: WebSocket, matchId: string): void {
    const room = this.ensureRoom(matchId);
    room.viewers.add(ws);
    ws.on("close", () => {
      room.viewers.delete(ws);
    });
    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      // Viewers can subscribe to additional rooms
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "type" in parsed &&
        (parsed as { type: unknown }).type === "subscribe" &&
        "matchId" in parsed
      ) {
        const mid = (parsed as { matchId: unknown }).matchId;
        if (typeof mid === "string") {
          this.addViewer(ws, mid);
        }
      }
    });
  }

  getSlotWs(matchId: string, slot: number): WebSocket | null {
    return this.rooms.get(matchId)?.slots.get(slot)?.ws ?? null;
  }
}

function extractBearer(req: IncomingMessage): string | null {
  const auth = req.headers["authorization"];
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export const hub = new WsHub();
