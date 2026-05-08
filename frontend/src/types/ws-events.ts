// WS event envelope union — lifted verbatim from the plan contract.
// Backend exports Zod schemas; these inferred types must stay in sync.

// ── Match-meta channel: match:{matchId}:meta ────────────────────────────────

export interface SlotInfo {
  slot: number
  occupied: boolean
  displayName?: string
  ready: boolean
  connectedAt?: string
}

export interface MatchLobbyStateEvent {
  kind: 'match.lobby_state'
  matchId: string
  slots: SlotInfo[]
}

export interface MatchStartedEvent {
  kind: 'match.started'
  matchId: string
  startedAt: string
  durationSec: number
  endsAt: string
}

export interface MatchEndedEvent {
  kind: 'match.ended'
  matchId: string
  endedAt: string
  reason: 'timer' | 'host_cancel' | 'all_disconnected'
}

export interface MatchSlotDisconnectedEvent {
  kind: 'match.slot_disconnected'
  matchId: string
  slot: number
  ts: string
  lastSeenAt: string
}

export interface MatchSlotReconnectedEvent {
  kind: 'match.slot_reconnected'
  matchId: string
  slot: number
  ts: string
}

export interface TunnelConnectedEvent {
  kind: 'tunnel.connected'
  matchId: string
  slot: number
  connectedAt: string
}

export interface TunnelDisconnectedEvent {
  kind: 'tunnel.disconnected'
  matchId: string
  slot: number
  disconnectedAt: string
  reason: string
}

export interface TunnelUpstreamErrorEvent {
  kind: 'tunnel.upstream_error'
  matchId: string
  slot: number
  status: number
  ts: string
}

export type MetaEvent =
  | MatchLobbyStateEvent
  | MatchStartedEvent
  | MatchEndedEvent
  | MatchSlotDisconnectedEvent
  | MatchSlotReconnectedEvent
  | TunnelConnectedEvent
  | TunnelDisconnectedEvent
  | TunnelUpstreamErrorEvent

// ── Per-slot prompt channel: match:{matchId}:slot:{n}:prompt ─────────────────

export interface PromptSubmittedEvent {
  kind: 'prompt.submitted'
  slot: number
  turnId: string
  text: string
  ts: string
}

export type PromptEvent = PromptSubmittedEvent

// ── Per-slot response channel: match:{matchId}:slot:{n}:response ─────────────

export interface ResponseTextDeltaEvent {
  kind: 'response.text_delta'
  slot: number
  turnId: string
  text: string
}

export interface ResponseToolUseStartedEvent {
  kind: 'response.tool_use_started'
  slot: number
  turnId: string
  toolUseId: string
  toolName: string
  // input is never broadcast
}

export interface ResponseToolUseCompletedEvent {
  kind: 'response.tool_use_completed'
  slot: number
  turnId: string
  toolUseId: string
  toolName: string
  summary: string  // ≤200 chars, server-generated, never includes file contents
  durationMs: number
  ok: boolean
}

export interface ResponseTurnCompletedEvent {
  kind: 'response.turn_completed'
  slot: number
  turnId: string
  stopReason: string
}

export type ResponseEvent =
  | ResponseTextDeltaEvent
  | ResponseToolUseStartedEvent
  | ResponseToolUseCompletedEvent
  | ResponseTurnCompletedEvent

// ── Envelope wrapper (server → viewer) ────────────────────────────────────────

export type MatchEventKind = MetaEvent | PromptEvent | ResponseEvent

export interface ServerEnvelope {
  channel: string
  event: MatchEventKind
}

// ── Client → server subscription messages ────────────────────────────────────

export interface SubscribeMessage {
  type: 'subscribe'
  channel: string
}

export interface UnsubscribeMessage {
  type: 'unsubscribe'
  channel: string
}

export interface PingMessage {
  type: 'ping'
}

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage
