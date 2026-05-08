import WebSocket from "ws";
import type {
  ResponseTextDeltaEnvelope,
  ResponseToolUseStartedEnvelope,
  ResponseToolUseCompletedEnvelope,
  ResponseTurnCompletedEnvelope,
} from "@killswitch/shared";

// Dynamic import to handle optional SDK
async function loadAgentSdk(): Promise<typeof import("@anthropic-ai/claude-agent-sdk")> {
  try {
    return await import("@anthropic-ai/claude-agent-sdk");
  } catch {
    throw new Error(
      "Claude Agent SDK not found. Install @anthropic-ai/claude-agent-sdk to use agent features."
    );
  }
}

function sanitizeSummary(toolName: string, output: string): string {
  // Never include file contents or raw stdout/stderr
  // Summary format: "<toolName> <sanitized-target> (<brief-outcome>)"
  const trimmed = output.trim().slice(0, 200);
  // Remove potential file content lines (lines > 100 chars are likely content)
  const lines = trimmed
    .split("\n")
    .filter((l) => l.length <= 100)
    .slice(0, 3)
    .join(" | ");
  return `${toolName}: ${lines || "completed"}`.slice(0, 200);
}

export async function runAgent(
  prompt: string,
  ws: WebSocket,
  slot: number,
  turnId: string,
  workspaceDir: string
): Promise<void> {
  const sdk = await loadAgentSdk();

  // ClaudeAgent may have different shapes depending on SDK version; use a safe approach
  const AgentClass =
    (sdk as unknown as { ClaudeAgent?: unknown }).ClaudeAgent ??
    (sdk as unknown as { default?: unknown }).default;

  if (!AgentClass || typeof AgentClass !== "function") {
    throw new Error("ClaudeAgent not found in SDK");
  }

  const systemPrompt = `You are a coding assistant running in a Killswitch competitive coding environment.

## Constraints
- Frontend dev server: :3000 (npm run dev or vite)
- Backend server: :3001
- No other ports may be bound or tunneled to viewers
- Tool execution is sandboxed to the workspace directory: ${workspaceDir}
- Do not read or write files outside this directory

## Your task
Help the user with their coding challenge. Be concise and focused.`;

  const agent = new (AgentClass as new (opts: unknown) => unknown)({
    systemPrompt,
    cwd: workspaceDir,
    model: process.env.CLAUDE_MODEL ?? "claude-opus-4-5",
  }) as {
    stream: (
      prompt: string
    ) => AsyncIterable<{
      type: string;
      delta?: { type?: string; text?: string };
      tool_use?: { id?: string; name?: string };
      tool_result?: {
        tool_use_id?: string;
        name?: string;
        content?: string;
        is_error?: boolean;
        duration_ms?: number;
      };
      stop_reason?: string;
    }>;
  };

  const startTimes = new Map<string, number>();

  for await (const event of agent.stream(prompt)) {
    switch (event.type) {
      case "assistant_message_delta": {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          const envelope: ResponseTextDeltaEnvelope = {
            type: "response.text_delta",
            slot,
            turnId,
            text: event.delta.text,
          };
          ws.send(JSON.stringify(envelope));
        }
        break;
      }

      case "tool_use_start": {
        const toolUseId = event.tool_use?.id ?? "";
        const toolName = event.tool_use?.name ?? "";
        startTimes.set(toolUseId, Date.now());
        const envelope: ResponseToolUseStartedEnvelope = {
          type: "response.tool_use_started",
          slot,
          turnId,
          toolUseId,
          toolName,
        };
        ws.send(JSON.stringify(envelope));
        break;
      }

      case "tool_use_complete": {
        const toolUseId = event.tool_result?.tool_use_id ?? "";
        const toolName = event.tool_result?.name ?? "";
        const startTime = startTimes.get(toolUseId) ?? Date.now();
        const durationMs = Date.now() - startTime;
        startTimes.delete(toolUseId);

        // Sanitize output - no raw content
        const rawOutput = event.tool_result?.content ?? "";
        const summary = sanitizeSummary(toolName, rawOutput);

        const envelope: ResponseToolUseCompletedEnvelope = {
          type: "response.tool_use_completed",
          slot,
          turnId,
          toolUseId,
          toolName,
          summary,
          durationMs,
          ok: !(event.tool_result?.is_error ?? false),
        };
        ws.send(JSON.stringify(envelope));
        break;
      }

      case "message_stop": {
        const envelope: ResponseTurnCompletedEnvelope = {
          type: "response.turn_completed",
          slot,
          turnId,
          stopReason: event.stop_reason ?? "end_turn",
        };
        ws.send(JSON.stringify(envelope));
        break;
      }
    }
  }
}
