import { z } from "zod";

// ─── Slot schema (reused) ────────────────────────────────────────────────────

export const SlotInfoSchema = z.object({
  slot: z.number().int().min(0).max(3),
  occupied: z.boolean(),
  displayName: z.string().optional(),
  ready: z.boolean(),
  connectedAt: z.string().optional(),
});

// ─── Match-meta channel (server → clients / viewers) ────────────────────────

export const MatchLobbyStateEnvelopeSchema = z.object({
  type: z.literal("match.lobby_state"),
  matchId: z.string(),
  slots: z.array(SlotInfoSchema),
});

export const MatchStartedEnvelopeSchema = z.object({
  type: z.literal("match.started"),
  matchId: z.string(),
  startedAt: z.string(),
  durationSec: z.number(),
  endsAt: z.string(),
});

export const MatchEndedEnvelopeSchema = z.object({
  type: z.literal("match.ended"),
  matchId: z.string(),
  endedAt: z.string(),
  reason: z.enum(["timer", "host_cancel", "all_disconnected"]),
});

export const MatchSlotDisconnectedEnvelopeSchema = z.object({
  type: z.literal("match.slot_disconnected"),
  matchId: z.string(),
  slot: z.number().int().min(0).max(3),
  ts: z.string(),
  lastSeenAt: z.string(),
});

export const MatchSlotReconnectedEnvelopeSchema = z.object({
  type: z.literal("match.slot_reconnected"),
  matchId: z.string(),
  slot: z.number().int().min(0).max(3),
  ts: z.string(),
});

export const TunnelConnectedEnvelopeSchema = z.object({
  type: z.literal("tunnel.connected"),
  matchId: z.string(),
  slot: z.number().int().min(0).max(3),
  connectedAt: z.string(),
});

export const TunnelDisconnectedEnvelopeSchema = z.object({
  type: z.literal("tunnel.disconnected"),
  matchId: z.string(),
  slot: z.number().int().min(0).max(3),
  disconnectedAt: z.string(),
  reason: z.string(),
});

export const TunnelUpstreamErrorEnvelopeSchema = z.object({
  type: z.literal("tunnel.upstream_error"),
  matchId: z.string(),
  slot: z.number().int().min(0).max(3),
  status: z.number(),
  ts: z.string(),
});

// ─── Kick frame (server → CLI) ───────────────────────────────────────────────

export const KickEnvelopeSchema = z.object({
  type: z.literal("kick"),
  reason: z.string(),
});

// ─── Version rejected frame (server → CLI) ───────────────────────────────────

export const VersionRejectedEnvelopeSchema = z.object({
  type: z.literal("version_rejected"),
  clientVersion: z.string(),
  acceptedRange: z.string(),
  message: z.string(),
});

// ─── CLI → server inbound envelopes ─────────────────────────────────────────

export const PromptSubmittedEnvelopeSchema = z.object({
  type: z.literal("prompt.submitted"),
  slot: z.number().int().min(0).max(3),
  turnId: z.string(),
  text: z.string().max(10000),
  ts: z.string(),
});

export const ResponseTextDeltaEnvelopeSchema = z.object({
  type: z.literal("response.text_delta"),
  slot: z.number().int().min(0).max(3),
  turnId: z.string(),
  text: z.string(),
});

export const ResponseToolUseStartedEnvelopeSchema = z.object({
  type: z.literal("response.tool_use_started"),
  slot: z.number().int().min(0).max(3),
  turnId: z.string(),
  toolUseId: z.string(),
  toolName: z.string(),
});

export const ResponseToolUseCompletedEnvelopeSchema = z.object({
  type: z.literal("response.tool_use_completed"),
  slot: z.number().int().min(0).max(3),
  turnId: z.string(),
  toolUseId: z.string(),
  toolName: z.string(),
  summary: z.string().max(200),
  durationMs: z.number(),
  ok: z.boolean(),
});

export const ResponseTurnCompletedEnvelopeSchema = z.object({
  type: z.literal("response.turn_completed"),
  slot: z.number().int().min(0).max(3),
  turnId: z.string(),
  stopReason: z.string(),
});

// ─── CLI connect frame ───────────────────────────────────────────────────────

export const CliConnectEnvelopeSchema = z.object({
  type: z.literal("cli.connect"),
  protocolVersion: z.string(),
  slot: z.number().int().min(0).max(3),
});

// ─── Subscribe frame (viewer → server) ──────────────────────────────────────

export const SubscribeEnvelopeSchema = z.object({
  type: z.literal("subscribe"),
  matchId: z.string(),
});

// ─── Tunnel frames (CLI ↔ server) ────────────────────────────────────────────

export const TunnelRequestEnvelopeSchema = z.object({
  type: z.literal("tunnel.request"),
  requestId: z.string(),
  method: z.string(),
  path: z.string(),
  headers: z.record(z.string()),
  body: z.string().optional(), // base64
});

export const TunnelResponseEnvelopeSchema = z.object({
  type: z.literal("tunnel.response"),
  requestId: z.string(),
  status: z.number(),
  headers: z.record(z.string()),
  body: z.string(), // base64
});

export const TunnelWSUpgradeEnvelopeSchema = z.object({
  type: z.literal("tunnel.ws_upgrade"),
  requestId: z.string(),
  path: z.string(),
  headers: z.record(z.string()),
});

export const TunnelWSFrameEnvelopeSchema = z.object({
  type: z.literal("tunnel.ws_frame"),
  requestId: z.string(),
  data: z.string(),
  binary: z.boolean(),
});

export const TunnelWSCloseEnvelopeSchema = z.object({
  type: z.literal("tunnel.ws_close"),
  requestId: z.string(),
  code: z.number(),
  reason: z.string(),
});

// ─── Discriminated unions ────────────────────────────────────────────────────

/**
 * All envelopes a CLI client can send to the server.
 */
export const ClientEnvelopeSchema = z.discriminatedUnion("type", [
  CliConnectEnvelopeSchema,
  SubscribeEnvelopeSchema,
  PromptSubmittedEnvelopeSchema,
  ResponseTextDeltaEnvelopeSchema,
  ResponseToolUseStartedEnvelopeSchema,
  ResponseToolUseCompletedEnvelopeSchema,
  ResponseTurnCompletedEnvelopeSchema,
  TunnelRequestEnvelopeSchema,
  TunnelResponseEnvelopeSchema,
  TunnelWSUpgradeEnvelopeSchema,
  TunnelWSFrameEnvelopeSchema,
  TunnelWSCloseEnvelopeSchema,
]);

/**
 * All envelopes the server can send to clients (CLI or viewer).
 */
export const ServerEnvelopeSchema = z.discriminatedUnion("type", [
  MatchLobbyStateEnvelopeSchema,
  MatchStartedEnvelopeSchema,
  MatchEndedEnvelopeSchema,
  MatchSlotDisconnectedEnvelopeSchema,
  MatchSlotReconnectedEnvelopeSchema,
  TunnelConnectedEnvelopeSchema,
  TunnelDisconnectedEnvelopeSchema,
  TunnelUpstreamErrorEnvelopeSchema,
  KickEnvelopeSchema,
  VersionRejectedEnvelopeSchema,
  // Server also relays these from CLI to viewers:
  PromptSubmittedEnvelopeSchema,
  ResponseTextDeltaEnvelopeSchema,
  ResponseToolUseStartedEnvelopeSchema,
  ResponseToolUseCompletedEnvelopeSchema,
  ResponseTurnCompletedEnvelopeSchema,
  TunnelRequestEnvelopeSchema,
  TunnelResponseEnvelopeSchema,
  TunnelWSUpgradeEnvelopeSchema,
  TunnelWSFrameEnvelopeSchema,
  TunnelWSCloseEnvelopeSchema,
]);

// ─── TypeScript types ────────────────────────────────────────────────────────

export type SlotInfo = z.infer<typeof SlotInfoSchema>;
export type MatchLobbyStateEnvelope = z.infer<typeof MatchLobbyStateEnvelopeSchema>;
export type MatchStartedEnvelope = z.infer<typeof MatchStartedEnvelopeSchema>;
export type MatchEndedEnvelope = z.infer<typeof MatchEndedEnvelopeSchema>;
export type MatchSlotDisconnectedEnvelope = z.infer<typeof MatchSlotDisconnectedEnvelopeSchema>;
export type MatchSlotReconnectedEnvelope = z.infer<typeof MatchSlotReconnectedEnvelopeSchema>;
export type TunnelConnectedEnvelope = z.infer<typeof TunnelConnectedEnvelopeSchema>;
export type TunnelDisconnectedEnvelope = z.infer<typeof TunnelDisconnectedEnvelopeSchema>;
export type TunnelUpstreamErrorEnvelope = z.infer<typeof TunnelUpstreamErrorEnvelopeSchema>;
export type KickEnvelope = z.infer<typeof KickEnvelopeSchema>;
export type VersionRejectedEnvelope = z.infer<typeof VersionRejectedEnvelopeSchema>;
export type PromptSubmittedEnvelope = z.infer<typeof PromptSubmittedEnvelopeSchema>;
export type ResponseTextDeltaEnvelope = z.infer<typeof ResponseTextDeltaEnvelopeSchema>;
export type ResponseToolUseStartedEnvelope = z.infer<typeof ResponseToolUseStartedEnvelopeSchema>;
export type ResponseToolUseCompletedEnvelope = z.infer<typeof ResponseToolUseCompletedEnvelopeSchema>;
export type ResponseTurnCompletedEnvelope = z.infer<typeof ResponseTurnCompletedEnvelopeSchema>;
export type CliConnectEnvelope = z.infer<typeof CliConnectEnvelopeSchema>;
export type SubscribeEnvelope = z.infer<typeof SubscribeEnvelopeSchema>;
export type TunnelRequestEnvelope = z.infer<typeof TunnelRequestEnvelopeSchema>;
export type TunnelResponseEnvelope = z.infer<typeof TunnelResponseEnvelopeSchema>;
export type TunnelWSUpgradeEnvelope = z.infer<typeof TunnelWSUpgradeEnvelopeSchema>;
export type TunnelWSFrameEnvelope = z.infer<typeof TunnelWSFrameEnvelopeSchema>;
export type TunnelWSCloseEnvelope = z.infer<typeof TunnelWSCloseEnvelopeSchema>;
export type ClientEnvelope = z.infer<typeof ClientEnvelopeSchema>;
export type ServerEnvelope = z.infer<typeof ServerEnvelopeSchema>;
