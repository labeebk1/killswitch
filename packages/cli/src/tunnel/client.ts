import http from "http";
import WebSocket from "ws";
import type {
  TunnelRequestEnvelope,
  TunnelResponseEnvelope,
  TunnelWSUpgradeEnvelope,
  TunnelWSFrameEnvelope,
  TunnelWSCloseEnvelope,
} from "@killswitch/shared";

const LOCAL_PORT = parseInt(process.env.LOCAL_PORT ?? "3000", 10);
const LOCAL_HOST = process.env.LOCAL_HOST ?? "127.0.0.1";

function rewriteLocalHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (lower === "x-frame-options") continue;
    if (lower === "content-security-policy") {
      out[k] = v
        .replace(/frame-ancestors[^;]*(;|$)/gi, "frame-ancestors 'none'$1")
        .trim();
      continue;
    }
    if (lower === "set-cookie") {
      const rewritten = v
        .split(/,(?=[^;]+=[^;])/)
        .map((cookie) => {
          let c = cookie;
          if (!/samesite/i.test(c)) c += "; SameSite=None";
          if (!/\bSecure\b/i.test(c)) c += "; Secure";
          return c;
        })
        .join(", ");
      out[k] = rewritten;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function handleTunnelRequest(
  envelope: TunnelRequestEnvelope,
  send: (envelope: TunnelResponseEnvelope) => void
): Promise<void> {
  return new Promise((resolve) => {
    const bodyBuf = envelope.body ? Buffer.from(envelope.body, "base64") : undefined;

    const options: http.RequestOptions = {
      hostname: LOCAL_HOST,
      port: LOCAL_PORT,
      path: envelope.path,
      method: envelope.method,
      headers: {
        ...envelope.headers,
        host: `${LOCAL_HOST}:${LOCAL_PORT}`,
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const rawHeaders: Record<string, string> = {};
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          rawHeaders[res.rawHeaders[i]] = res.rawHeaders[i + 1];
        }
        const rewritten = rewriteLocalHeaders(rawHeaders);
        send({
          type: "tunnel.response",
          requestId: envelope.requestId,
          status: res.statusCode ?? 200,
          headers: rewritten,
          body: body.toString("base64"),
        });
        resolve();
      });
    });

    req.on("error", (err) => {
      process.stderr.write(`[tunnel/client] request error: ${String(err)}\n`);
      send({
        type: "tunnel.response",
        requestId: envelope.requestId,
        status: 502,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ error: "upstream error", message: err.message })).toString(
          "base64"
        ),
      });
      resolve();
    });

    if (bodyBuf && bodyBuf.length > 0) {
      req.write(bodyBuf);
    }
    req.end();
  });
}

export function handleTunnelWSUpgrade(
  envelope: TunnelWSUpgradeEnvelope,
  serverWs: WebSocket
): void {
  const targetUrl = `ws://${LOCAL_HOST}:${LOCAL_PORT}${envelope.path}`;

  const localWs = new WebSocket(targetUrl, {
    headers: envelope.headers,
  });

  localWs.on("open", () => {
    // Ready to relay
  });

  // Local → server
  localWs.on("message", (data, isBinary) => {
    const frame: TunnelWSFrameEnvelope = {
      type: "tunnel.ws_frame",
      requestId: envelope.requestId,
      data: Buffer.isBuffer(data) ? data.toString("base64") : String(data),
      binary: isBinary,
    };
    serverWs.send(JSON.stringify(frame));
  });

  localWs.on("close", (code, reason) => {
    const close: TunnelWSCloseEnvelope = {
      type: "tunnel.ws_close",
      requestId: envelope.requestId,
      code,
      reason: reason.toString(),
    };
    serverWs.send(JSON.stringify(close));
  });

  localWs.on("error", (err) => {
    process.stderr.write(`[tunnel/client] local ws error: ${String(err)}\n`);
    const close: TunnelWSCloseEnvelope = {
      type: "tunnel.ws_close",
      requestId: envelope.requestId,
      code: 1011,
      reason: err.message,
    };
    serverWs.send(JSON.stringify(close));
  });

  // Server → local (the connect command sets up event routing for ws_frame)
  // This function is called from the connect command's message handler which
  // routes tunnel.ws_frame for this requestId to this localWs instance.
  // We expose a handle method for the connect command to call.
  (localWs as WebSocket & { _requestId: string })._requestId = envelope.requestId;
}
