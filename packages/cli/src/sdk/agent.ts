import WebSocket from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  ResponseTextDeltaEnvelope,
  ResponseToolUseStartedEnvelope,
  ResponseToolUseCompletedEnvelope,
  ResponseTurnCompletedEnvelope,
} from "@killswitch/shared";

function sanitizeSummary(toolName: string, output: string): string {
  const trimmed = output.trim().slice(0, 200);
  // Drop lines that look like raw file content (>100 chars)
  const lines = trimmed
    .split("\n")
    .filter((l) => l.length <= 100)
    .slice(0, 3)
    .join(" | ");
  return `${toolName}: ${lines || "completed"}`.slice(0, 200);
}

const SYSTEM_PROMPT = (workspaceDir: string) =>
  `You are a coding assistant running in a Killswitch competitive coding environment.

## Constraints
- Frontend dev server: :3000 (npm run dev or vite)
- Backend server: :3001
- No other ports may be bound or tunneled to viewers
- Tool execution is sandboxed to the workspace directory: ${workspaceDir}
- Do not read or write files outside this directory

## Your task
Help the user with their coding challenge. Be concise and focused.`;

export async function runAgent(
  prompt: string,
  ws: WebSocket,
  slot: number,
  turnId: string,
  workspaceDir: string
): Promise<void> {
  // Map toolUseId → { toolName, startTime } for tracking completion
  const toolStartMap = new Map<string, { toolName: string; startTime: number }>();

  const q = query({
    prompt,
    options: {
      cwd: workspaceDir,
      systemPrompt: SYSTEM_PROMPT(workspaceDir),
    },
  });

  for await (const msg of q as AsyncIterable<SDKMessage>) {
    // stream_event carries raw Anthropic API streaming events — use for real-time deltas
    if (msg.type === "stream_event") {
      const event = msg.event as {
        type: string;
        index?: number;
        content_block?: { type: string; id?: string; name?: string };
        delta?: { type: string; text?: string };
      };

      if (
        event.type === "content_block_start" &&
        event.content_block?.type === "tool_use" &&
        event.content_block.id
      ) {
        const toolUseId = event.content_block.id;
        const toolName = event.content_block.name ?? "";
        toolStartMap.set(toolUseId, { toolName, startTime: Date.now() });
        const envelope: ResponseToolUseStartedEnvelope = {
          type: "response.tool_use_started",
          slot,
          turnId,
          toolUseId,
          toolName,
        };
        ws.send(JSON.stringify(envelope));
      }

      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta" &&
        event.delta.text
      ) {
        const envelope: ResponseTextDeltaEnvelope = {
          type: "response.text_delta",
          slot,
          turnId,
          text: event.delta.text,
        };
        ws.send(JSON.stringify(envelope));
      }
    }

    // user message with tool_use_result = tool execution completed
    if (msg.type === "user" && (msg as { tool_use_result?: unknown }).tool_use_result !== undefined) {
      const msgParam = (msg as { message: { content?: unknown } }).message;
      const content = msgParam?.content;
      const blocks = Array.isArray(content) ? content : [];
      for (const block of blocks as Array<{
        type?: string;
        tool_use_id?: string;
        content?: unknown;
        is_error?: boolean;
      }>) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const entry = toolStartMap.get(block.tool_use_id);
          const durationMs = entry ? Date.now() - entry.startTime : 0;
          toolStartMap.delete(block.tool_use_id);

          const rawContent =
            typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
              ? (block.content as Array<{ type?: string; text?: string }>)
                  .filter((b) => b.type === "text")
                  .map((b) => b.text ?? "")
                  .join("")
              : "";

          const envelope: ResponseToolUseCompletedEnvelope = {
            type: "response.tool_use_completed",
            slot,
            turnId,
            toolUseId: block.tool_use_id,
            toolName: entry?.toolName ?? "",
            summary: sanitizeSummary(entry?.toolName ?? "tool", rawContent),
            durationMs,
            ok: !block.is_error,
          };
          ws.send(JSON.stringify(envelope));
        }
      }
    }

    // result = turn complete
    if (msg.type === "result") {
      const result = msg as { stop_reason?: string | null };
      const envelope: ResponseTurnCompletedEnvelope = {
        type: "response.turn_completed",
        slot,
        turnId,
        stopReason: result.stop_reason ?? "end_turn",
      };
      ws.send(JSON.stringify(envelope));
    }
  }
}
