import http from "http";
import express from "express";
import { WebSocketServer } from "ws";
import { db, sqlite } from "./db";
import { runMigrations } from "./db/migrate";
import { matchCompetitors, matches } from "./db/schema";
import { hub } from "./ws/hub";
import { batcher } from "./lib/eventBatcher";
import { clearAllTimers } from "./lib/lifecycle";
import apiRouter from "./routes";
import { createProxyRouter } from "./tunnel/proxy";
import { inArray } from "drizzle-orm";

async function reloadSlotKeys(): Promise<void> {
  try {
    // Re-register slot keys for all non-ended matches
    const activeMatches = await db.query.matches.findMany();
    const activeIds = activeMatches
      .filter((m) => m.status === "lobby" || m.status === "live")
      .map((m) => m.id);
    if (activeIds.length === 0) return;

    const competitors = await db.select().from(matchCompetitors)
      .where(inArray(matchCompetitors.matchId, activeIds));

    for (const c of competitors) {
      hub.registerSlotKey(c.slotKey, c.matchId, c.slot);
      hub.ensureRoom(c.matchId);
    }
    process.stderr.write(`[server] reloaded ${competitors.length} slot keys\n`);
  } catch (err) {
    process.stderr.write(`[server] slot key reload warning: ${String(err)}\n`);
  }
}

const PORT = parseInt(process.env.PORT ?? "3100", 10);

async function main(): Promise<void> {
  // Run inline DDL migrations
  try {
    runMigrations();
  } catch (err) {
    process.stderr.write(`[server] migration warning: ${String(err)}\n`);
  }

  // Re-register slot keys for active matches (in-memory index lost on restart)
  await reloadSlotKeys();

  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // API routes
  app.use(apiRouter);

  // Tunnel proxy routes
  app.use(createProxyRouter());

  // Error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      process.stderr.write(`[server] error: ${err.message}\n`);
      if (res.headersSent) return;
      if (err.name === "ZodError") {
        res.status(400).json({ error: "validation error", details: err.message });
        return;
      }
      res.status(500).json({ error: "internal server error" });
    }
  );

  const server = http.createServer(app);

  // Attach WS hub
  hub.attach(server);

  // Viewer WS server (for browser viewers subscribing to match channels)
  const viewerWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "ws://localhost");
    if (url.pathname === "/ws/viewer") {
      viewerWss.handleUpgrade(req, socket, head, (ws) => {
        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as { type?: string; matchId?: string };
            if (msg.type === "subscribe" && msg.matchId) {
              hub.addViewer(ws, msg.matchId);
            }
          } catch {
            // ignore
          }
        });
      });
    }
  });

  server.listen(PORT, () => {
    process.stderr.write(`[server] listening on port ${PORT}\n`);
  });

  // Graceful shutdown
  const shutdown = (): void => {
    process.stderr.write("[server] shutting down\n");
    clearAllTimers();
    batcher.stop();
    batcher.flush().finally(() => {
      server.close(() => {
        sqlite.close();
        process.exit(0);
      });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[server] fatal: ${String(err)}\n`);
  process.exit(1);
});
