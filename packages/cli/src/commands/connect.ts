import https from "https";
import http from "http";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";
import WebSocket from "ws";
import { ServerEnvelopeSchema } from "@killswitch/shared";
import type {
  TunnelRequestEnvelope,
  TunnelWSUpgradeEnvelope,
  TunnelWSFrameEnvelope,
  TunnelWSCloseEnvelope,
  TunnelResponseEnvelope,
} from "@killswitch/shared";
import { handleTunnelRequest } from "../tunnel/client";
import { runAgent } from "../sdk/agent";
import { scaffoldWorkspace } from "../workspace/scaffold";

const DEFAULT_SERVER_URL = "https://api.killswitch.bonecho.ai";

interface SlotInfo {
  matchId: string;
  slot: number;
  matchStatus: string;
}

function getServerUrl(): string {
  return process.env.KILLSWITCH_SERVER_URL ?? DEFAULT_SERVER_URL;
}

function fetchSlotInfo(slotKey: string, serverUrl: string): Promise<SlotInfo> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/slots/${encodeURIComponent(slotKey)}`, serverUrl);
    const lib = url.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "GET",
        headers: {
          Authorization: `Bearer ${slotKey}`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString()) as SlotInfo & { error?: string };
            if (res.statusCode !== 200) {
              reject(new Error(body.error ?? `HTTP ${res.statusCode}`));
              return;
            }
            resolve(body);
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

export async function connectCommand(args: string[]): Promise<void> {
  const slotKey = args[0];
  if (!slotKey) {
    process.stderr.write("Usage: killswitch connect <slot-key>\n");
    process.exit(1);
  }

  const serverUrl = getServerUrl();
  process.stdout.write(`Connecting to ${serverUrl}...\n`);

  let slotInfo: SlotInfo;
  try {
    slotInfo = await fetchSlotInfo(slotKey, serverUrl);
  } catch (err) {
    process.stderr.write(`[connect] failed to get slot info: ${String(err)}\n`);
    process.exit(1);
  }

  const { matchId, slot } = slotInfo;

  // Set up workspace directory
  const workspaceDir = path.join(
    os.homedir(),
    ".killswitch",
    "workspaces",
    `${matchId}-${slot}`
  );

  try {
    const fs = await import("fs");
    if (!fs.existsSync(workspaceDir)) {
      scaffoldWorkspace(workspaceDir);
    }
  } catch (err) {
    process.stderr.write(`[connect] workspace setup warning: ${String(err)}\n`);
  }

  // Build WS URL
  const wsBase = serverUrl.replace(/^http/, "ws");
  const wsUrl = `${wsBase}/ws/match/${matchId}?slotKey=${encodeURIComponent(slotKey)}`;

  process.stdout.write(`Opening WebSocket to ${wsUrl}\n`);

  const ws = new WebSocket(wsUrl);

  // Track active local WS connections keyed by requestId
  const localWsMap = new Map<string, WebSocket>();

  // Local prompt server at :3100 — accepts POST /prompt { text }
  const PROMPT_PORT = parseInt(process.env.PROMPT_PORT ?? "3100", 10);
  const promptServer = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/prompt") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        let body: { text?: string };
        try {
          body = JSON.parse(Buffer.concat(chunks).toString()) as { text?: string };
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }
        if (!body.text) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing text" }));
          return;
        }
        const turnId = nanoid();
        const promptEnvelope = {
          type: "prompt.submitted" as const,
          slot,
          turnId,
          text: body.text,
          ts: new Date().toISOString(),
        };
        ws.send(JSON.stringify(promptEnvelope));
        runAgent(body.text, ws, slot, turnId, workspaceDir).catch((err) => {
          process.stderr.write(`[connect] agent error: ${String(err)}\n`);
        });
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, turnId }));
      });
    } else if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  promptServer.listen(PROMPT_PORT);

  ws.on("open", () => {
    // Send cli.connect
    ws.send(
      JSON.stringify({
        type: "cli.connect",
        protocolVersion: "1.0.0",
        slot,
      })
    );

    process.stdout.write(
      `Killswitch ready. Match: ${matchId}, Slot: ${slot}. Prompt UI: http://localhost:${PROMPT_PORT}\n`
    );
  });

  ws.on("message", (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const result = ServerEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      // Could be an error frame or unknown envelope; log and continue
      process.stderr.write(`[connect] unrecognised envelope: ${JSON.stringify(parsed)}\n`);
      return;
    }

    const envelope = result.data;

    switch (envelope.type) {
      case "kick":
        process.stdout.write(`Kicked: ${envelope.reason}\n`);
        ws.close();
        process.exit(0);
        break;

      case "tunnel.request":
        handleTunnelRequest(envelope as TunnelRequestEnvelope, (resp: TunnelResponseEnvelope) => {
          ws.send(JSON.stringify(resp));
        }).catch((err) => {
          process.stderr.write(`[connect] tunnel request error: ${String(err)}\n`);
        });
        break;

      case "tunnel.ws_upgrade": {
        const upgradeEnv = envelope as TunnelWSUpgradeEnvelope;
        const targetUrl = `ws://127.0.0.1:${process.env.LOCAL_PORT ?? "3000"}${upgradeEnv.path}`;
        const localWs = new WebSocket(targetUrl, { headers: upgradeEnv.headers });
        localWsMap.set(upgradeEnv.requestId, localWs);

        localWs.on("message", (data, isBinary) => {
          const frame: TunnelWSFrameEnvelope = {
            type: "tunnel.ws_frame",
            requestId: upgradeEnv.requestId,
            data: Buffer.isBuffer(data) ? data.toString("base64") : String(data),
            binary: isBinary,
          };
          ws.send(JSON.stringify(frame));
        });

        localWs.on("close", (code, reason) => {
          localWsMap.delete(upgradeEnv.requestId);
          const close: TunnelWSCloseEnvelope = {
            type: "tunnel.ws_close",
            requestId: upgradeEnv.requestId,
            code,
            reason: reason.toString(),
          };
          ws.send(JSON.stringify(close));
        });

        localWs.on("error", (err) => {
          process.stderr.write(`[connect] local ws error: ${String(err)}\n`);
        });
        break;
      }

      case "tunnel.ws_frame": {
        const frameEnv = envelope as TunnelWSFrameEnvelope;
        const localWs = localWsMap.get(frameEnv.requestId);
        if (localWs && localWs.readyState === WebSocket.OPEN) {
          const buf = Buffer.from(frameEnv.data, "base64");
          localWs.send(frameEnv.binary ? buf : buf.toString(), { binary: frameEnv.binary });
        }
        break;
      }

      case "tunnel.ws_close": {
        const closeEnv = envelope as TunnelWSCloseEnvelope;
        const localWs = localWsMap.get(closeEnv.requestId);
        if (localWs) {
          localWs.close(closeEnv.code, closeEnv.reason);
          localWsMap.delete(closeEnv.requestId);
        }
        break;
      }

      // prompt.submitted is handled locally via the prompt server; no-op if server echoes it back
      case "prompt.submitted":
        break;
    }
  });

  ws.on("close", (code, reason) => {
    process.stdout.write(`WebSocket closed: ${code} ${reason.toString()}\n`);
    // Attempt reconnect after brief delay
    setTimeout(() => {
      process.stdout.write("Attempting reconnect...\n");
      connectCommand(args);
    }, 3000);
  });

  ws.on("error", (err) => {
    process.stderr.write(`[connect] ws error: ${String(err)}\n`);
  });
}
