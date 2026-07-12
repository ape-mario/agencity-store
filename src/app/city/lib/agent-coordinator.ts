// Stubbed agent coordinator for the city UI port.

export type AgentEventType =
  | "alert"
  | "query"
  | "response"
  | "handoff"
  | "update"
  | "token_launch"
  | "fee_claim"
  | "distribution"
  | "world_health"
  | "whale_alert"
  | "token_pump"
  | "token_dump"
  | "arena_victory";

export interface AgentEvent {
  id: string;
  from: string;
  to: string | "*";
  type: AgentEventType;
  content: string;
  data?: Record<string, unknown>;
  timestamp: number;
  priority?: "low" | "normal" | "high" | "urgent";
}
