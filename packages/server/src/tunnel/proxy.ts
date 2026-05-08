import type { Request, Response, NextFunction } from "express";
import type { Router } from "express";
import { Router as createRouter } from "express";
import WebSocket from "ws";
import { nanoid } from "nanoid";
import { hub } from "../ws/hub";
import { rewriteTunnelHeaders } from "@killswitch/shared";
import type {
  TunnelResponseEnvelope,
  TunnelWSFrameEnvelope,
  TunnelWSCloseEnvelope,
} from "@killswitch/shared";

// ─── LRU Cache ────────────────────────────────────────────────────────────────

const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB

interface CacheEntry {
  data: Buffer;
  headers: Record<string, string>;
  status: number;
  key: string;
}

class LRUCache {
  private map = new Map<string, CacheEntry>();
  private totalBytes = 0;

  get(key: string): CacheEntry | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    if (this.map.has(key)) {
      this.totalBytes -= this.map.get(key)!.data.length;
      this.map.delete(key);
    }
    while (this.totalBytes + entry.data.length > MAX_CACHE_BYTES && this.map.size > 0) {
      const oldest = this.map.keys().next().value!;
      this.totalBytes -= this.map.get(oldest)!.data.length;
      this.map.delete(oldest);
    }
    this.map.set(key, entry);
    this.totalBytes += entry.data.length;
  }
}

const cache = new LRUCache();

// ─── Proxy router ─────────────────────────────────────────────────────────────

export function createProxyRouter(): Router {
  const router = createRouter();

  router.all("/m/:matchId/:slot/*", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { matchId, slot: slotStr } = req.params;
      const slot = parseInt(slotStr, 10);
      if (isNaN(slot) || slot < 0 || slot > 3) {
        res.status(400).json({ error: "invalid slot" });
        return;
      }

      const slotWs = hub.getSlotWs(matchId, slot);
      if (!slotWs || slotWs.readyState !== WebSocket.OPEN) {
        res.status(503).json({ error: "slot not connected" });
        return;
      }

      // Reconstruct path after /m/:matchId/:slot
      const afterSlot = req.params[0] ?? "";
      const targetPath = "/" + afterSlot + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");

      const etag = req.headers["if-none-match"] as string | undefined;
      const cacheKey = `${matchId}:${slot}:${targetPath}:${etag ?? ""}`;

      // Check LRU cache for GET requests
      if (req.method === "GET") {
        const cached = cache.get(cacheKey);
        if (cached) {
          for (const [k, v] of Object.entries(cached.headers)) {
            res.setHeader(k, v);
          }
          res.status(cached.status).send(cached.data);
          return;
        }
      }

      const requestId = nanoid();

      // Build outbound headers (filter hop-by-hop)
      const outHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        const lower = k.toLowerCase();
        if (["host", "connection", "upgrade", "keep-alive", "transfer-encoding"].includes(lower)) continue;
        outHeaders[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
      }

      // Read body
      let bodyB64: string | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", resolve);
          req.on("error", reject);
        });
        if (chunks.length > 0) {
          bodyB64 = Buffer.concat(chunks).toString("base64");
        }
      }

      // Send tunnel.request to CLI
      slotWs.send(
        JSON.stringify({
          type: "tunnel.request",
          requestId,
          method: req.method,
          path: targetPath,
          headers: outHeaders,
          body: bodyB64,
        })
      );

      // Wait for tunnel.response
      await new Promise<void>((resolve, reject) => {
        const evtKey = `tunnel.response:${requestId}`;
        const timeout = setTimeout(() => {
          hub.off(evtKey, onResponse);
          reject(new Error("tunnel request timeout"));
        }, 10_000);

        const onResponse = (data: unknown) => {
          clearTimeout(timeout);
          hub.off(evtKey, onResponse);

          const envelope = data as TunnelResponseEnvelope;
          const rewritten = rewriteTunnelHeaders(envelope.headers);

          for (const [k, v] of Object.entries(rewritten)) {
            res.setHeader(k, v);
          }

          const bodyBuf = Buffer.from(envelope.body, "base64");

          // Cache GET 2xx responses
          if (req.method === "GET" && envelope.status >= 200 && envelope.status < 300) {
            cache.set(cacheKey, {
              data: bodyBuf,
              headers: rewritten,
              status: envelope.status,
              key: cacheKey,
            });
          }

          res.status(envelope.status).send(bodyBuf);
          resolve();
        };

        hub.on(evtKey, onResponse);
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ─── WS upgrade handling for proxy ───────────────────────────────────────────

export function handleProxyWsUpgrade(
  req: import("http").IncomingMessage,
  socket: import("net").Socket,
  head: Buffer,
  wss: import("ws").WebSocketServer
): void {
  const url = new URL(req.url ?? "/", "ws://localhost");
  const match = url.pathname.match(/^\/m\/([^/]+)\/(\d+)\/(.*)$/);
  if (!match) {
    socket.destroy();
    return;
  }
  const [, matchId, slotStr, rest] = match;
  const slot = parseInt(slotStr, 10);
  const targetPath = "/" + rest;

  const slotWs = hub.getSlotWs(matchId, slot);
  if (!slotWs || slotWs.readyState !== WebSocket.OPEN) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (viewerWs) => {
    const requestId = nanoid();

    const outHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      outHeaders[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
    }

    // Send upgrade request to CLI
    slotWs.send(
      JSON.stringify({
        type: "tunnel.ws_upgrade",
        requestId,
        path: targetPath,
        headers: outHeaders,
      })
    );

    // Relay frames: viewer → CLI
    viewerWs.on("message", (data, isBinary) => {
      const frame: TunnelWSFrameEnvelope = {
        type: "tunnel.ws_frame",
        requestId,
        data: Buffer.isBuffer(data) ? data.toString("base64") : String(data),
        binary: isBinary,
      };
      slotWs.send(JSON.stringify(frame));
    });

    viewerWs.on("close", (code, reason) => {
      const close: TunnelWSCloseEnvelope = {
        type: "tunnel.ws_close",
        requestId,
        code,
        reason: reason.toString(),
      };
      slotWs.send(JSON.stringify(close));
    });

    // Relay frames: CLI → viewer
    const onFrame = (data: unknown) => {
      const env = data as TunnelWSFrameEnvelope;
      const buf = Buffer.from(env.data, "base64");
      viewerWs.send(env.binary ? buf : buf.toString(), { binary: env.binary });
    };
    const onClose = (data: unknown) => {
      const env = data as TunnelWSCloseEnvelope;
      hub.off(`tunnel.ws_frame:${requestId}`, onFrame);
      hub.off(`tunnel.ws_close:${requestId}`, onClose);
      viewerWs.close(env.code, env.reason);
    };

    hub.on(`tunnel.ws_frame:${requestId}`, onFrame);
    hub.on(`tunnel.ws_close:${requestId}`, onClose);
  });
}
