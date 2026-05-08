// Observability log event shapes
//
// The backend emits these pino log entries; the CloudWatch metric filters
// in infrastructure/terraform/modules/observability/ parse them.
//
// Every structured log entry must include at least: event, matchId, slot (where applicable).
// The fields marked [metric] are what the CloudWatch filters extract.

export interface AgentMessageSentEvent {
  event: "agent.message_sent"; // [metric] AgentMessagesSent
  matchId: string;
  slot: number;
  turnId: string;
  ts: string;
}

export interface TunnelRequestEvent {
  event: "tunnel.request"; // [metric] TunnelRequests
  matchId: string;
  slot: number;
  requestId: string;
  path: string;
  ts: string;
}

export interface TunnelResponseEvent {
  event: "tunnel.response"; // [metric] TunnelLatencyMs (durationMs field)
  matchId: string;
  slot: number;
  requestId: string;
  durationMs: number; // [metric-value]
  status: number;
  cached: boolean;
  ts: string;
}

export interface WsFanoutEvent {
  event: "ws.fanout"; // [metric] WsFanoutSize (subscriberCount field)
  channel: string; // e.g. "match:abc:slot:0:response"
  subscriberCount: number; // [metric-value]
  ts: string;
}

export interface CliHeartbeatEvent {
  event: "cli.heartbeat"; // [metric] CliHeartbeatAgeMs (ageMs field)
  matchId: string;
  slot: number;
  ageMs: number; // [metric-value] milliseconds since last heartbeat received
  ts: string;
}

export type ObservabilityEvent =
  | AgentMessageSentEvent
  | TunnelRequestEvent
  | TunnelResponseEvent
  | WsFanoutEvent
  | CliHeartbeatEvent;
