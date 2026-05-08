// Typed pino log event shapes.
// The backend emits these as structured JSON to stdout; the CloudWatch metric
// filters in infrastructure/terraform/modules/observability/ parse the fields
// marked [metric-value] to populate the Killswitch/* namespace.

export interface AgentMessageSentEvent {
  event: "agent.message_sent";
  matchId: string;
  slot: number;
  turnId: string;
  ts: string;
}

export interface TunnelRequestEvent {
  event: "tunnel.request";
  matchId: string;
  slot: number;
  requestId: string;
  path: string;
  ts: string;
}

export interface TunnelResponseEvent {
  event: "tunnel.response";
  matchId: string;
  slot: number;
  requestId: string;
  durationMs: number; // [metric-value] → TunnelLatencyMs
  status: number;
  cached: boolean;
  ts: string;
}

export interface WsFanoutEvent {
  event: "ws.fanout";
  channel: string;
  subscriberCount: number; // [metric-value] → WsFanoutSize
  ts: string;
}

export interface CliHeartbeatEvent {
  event: "cli.heartbeat";
  matchId: string;
  slot: number;
  ageMs: number; // [metric-value] → CliHeartbeatAgeMs
  ts: string;
}

export type ObservabilityEvent =
  | AgentMessageSentEvent
  | TunnelRequestEvent
  | TunnelResponseEvent
  | WsFanoutEvent
  | CliHeartbeatEvent;
