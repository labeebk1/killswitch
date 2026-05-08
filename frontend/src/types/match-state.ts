import type { SlotInfo } from './ws-events'

export type MatchStatus = 'connecting' | 'lobby' | 'live' | 'ended' | 'error'

export interface ToolUseBlock {
  type: 'tool_started' | 'tool_completed'
  toolUseId: string
  toolName: string
  summary?: string
  durationMs?: number
  ok?: boolean
}

export type ResponseBlock =
  | { type: 'text'; text: string }
  | ToolUseBlock

export interface Turn {
  turnId: string
  promptText: string
  promptTs: string
  responseBlocks: ResponseBlock[]
  activeToolUseIds: Set<string>
  completed: boolean
  stopReason?: string
}

export interface SlotState {
  slot: number
  occupied: boolean
  displayName?: string
  ready: boolean
  tunnelConnected: boolean
  slotDisconnected: boolean
  lastSeenAt?: string
  tunnelError?: { status: number; ts: string }
  turns: Turn[]
  activeTurnId?: string
}

export interface MatchState {
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  matchStatus: MatchStatus
  matchId: string
  durationSec?: number
  startedAt?: string
  endsAt?: string
  endedAt?: string
  endReason?: string
  slots: SlotState[]
  focusedSlot: number
}

function emptySlot(slot: number): SlotState {
  return {
    slot,
    occupied: false,
    ready: false,
    tunnelConnected: false,
    slotDisconnected: false,
    turns: [],
  }
}

export function initialMatchState(matchId: string): MatchState {
  return {
    connectionStatus: 'connecting',
    matchStatus: 'connecting',
    matchId,
    slots: [0, 1, 2, 3].map(emptySlot),
    focusedSlot: 0,
  }
}

// ── Reducer ──────────────────────────────────────────────────────────────────

export type MatchAction =
  | { type: 'WS_STATUS'; status: MatchState['connectionStatus'] }
  | { type: 'LOBBY_STATE'; slots: SlotInfo[] }
  | { type: 'MATCH_STARTED'; startedAt: string; durationSec: number; endsAt: string }
  | { type: 'MATCH_ENDED'; endedAt: string; reason: string }
  | { type: 'SLOT_DISCONNECTED'; slot: number; lastSeenAt: string }
  | { type: 'SLOT_RECONNECTED'; slot: number }
  | { type: 'TUNNEL_CONNECTED'; slot: number }
  | { type: 'TUNNEL_DISCONNECTED'; slot: number }
  | { type: 'TUNNEL_ERROR'; slot: number; status: number; ts: string }
  | { type: 'PROMPT_SUBMITTED'; slot: number; turnId: string; text: string; ts: string }
  | { type: 'TEXT_DELTA'; slot: number; turnId: string; text: string }
  | { type: 'TOOL_USE_STARTED'; slot: number; turnId: string; toolUseId: string; toolName: string }
  | { type: 'TOOL_USE_COMPLETED'; slot: number; turnId: string; toolUseId: string; toolName: string; summary: string; durationMs: number; ok: boolean }
  | { type: 'TURN_COMPLETED'; slot: number; turnId: string; stopReason: string }
  | { type: 'SET_FOCUS'; slot: number }

function patchSlot(
  slots: SlotState[],
  index: number,
  update: Partial<SlotState> | ((s: SlotState) => SlotState)
): SlotState[] {
  return slots.map((s) => {
    if (s.slot !== index) return s
    return typeof update === 'function' ? update(s) : { ...s, ...update }
  })
}

function updateTurn(turns: Turn[], turnId: string, update: (t: Turn) => Turn): Turn[] {
  return turns.map((t) => (t.turnId === turnId ? update(t) : t))
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'WS_STATUS': {
      let matchStatus = state.matchStatus
      if (action.status === 'connected' && state.matchStatus === 'connecting') {
        matchStatus = 'lobby'
      } else if (
        action.status === 'disconnected' &&
        (state.matchStatus === 'connecting' || state.matchStatus === 'lobby')
      ) {
        // Permanent disconnect before match loaded — surface hard error
        matchStatus = 'error'
      }
      return { ...state, connectionStatus: action.status, matchStatus }
    }

    case 'LOBBY_STATE': {
      const slots = state.slots.map((s) => {
        const info = action.slots.find((i) => i.slot === s.slot)
        if (!info) return s
        return { ...s, occupied: info.occupied, displayName: info.displayName, ready: info.ready }
      })
      return { ...state, matchStatus: 'lobby', slots }
    }

    case 'MATCH_STARTED':
      return {
        ...state,
        matchStatus: 'live',
        startedAt: action.startedAt,
        durationSec: action.durationSec,
        endsAt: action.endsAt,
      }

    case 'MATCH_ENDED':
      return { ...state, matchStatus: 'ended', endedAt: action.endedAt, endReason: action.reason }

    case 'SLOT_DISCONNECTED':
      return {
        ...state,
        slots: patchSlot(state.slots, action.slot, {
          slotDisconnected: true,
          lastSeenAt: action.lastSeenAt,
        }),
      }

    case 'SLOT_RECONNECTED':
      return {
        ...state,
        slots: patchSlot(state.slots, action.slot, {
          slotDisconnected: false,
          lastSeenAt: undefined,
        }),
      }

    case 'TUNNEL_CONNECTED':
      return {
        ...state,
        slots: patchSlot(state.slots, action.slot, {
          tunnelConnected: true,
          tunnelError: undefined,
        }),
      }

    case 'TUNNEL_DISCONNECTED':
      return {
        ...state,
        slots: patchSlot(state.slots, action.slot, { tunnelConnected: false }),
      }

    case 'TUNNEL_ERROR':
      return {
        ...state,
        slots: patchSlot(state.slots, action.slot, {
          tunnelError: { status: action.status, ts: action.ts },
        }),
      }

    case 'PROMPT_SUBMITTED': {
      const turn: Turn = {
        turnId: action.turnId,
        promptText: action.text,
        promptTs: action.ts,
        responseBlocks: [],
        activeToolUseIds: new Set(),
        completed: false,
      }
      return {
        ...state,
        slots: patchSlot(state.slots, action.slot, (s) => ({
          ...s,
          activeTurnId: action.turnId,
          turns: [...s.turns, turn],
        })),
      }
    }

    case 'TEXT_DELTA':
      return {
        ...state,
        slots: state.slots.map((s) => {
          if (s.slot !== action.slot) return s
          const turns = updateTurn(s.turns, action.turnId, (t) => {
            const last = t.responseBlocks[t.responseBlocks.length - 1]
            if (last?.type === 'text') {
              return {
                ...t,
                responseBlocks: [
                  ...t.responseBlocks.slice(0, -1),
                  { type: 'text' as const, text: last.text + action.text },
                ],
              }
            }
            return {
              ...t,
              responseBlocks: [...t.responseBlocks, { type: 'text' as const, text: action.text }],
            }
          })
          return { ...s, turns }
        }),
      }

    case 'TOOL_USE_STARTED':
      return {
        ...state,
        slots: state.slots.map((s) => {
          if (s.slot !== action.slot) return s
          const turns = updateTurn(s.turns, action.turnId, (t) => ({
            ...t,
            responseBlocks: [
              ...t.responseBlocks,
              { type: 'tool_started' as const, toolUseId: action.toolUseId, toolName: action.toolName },
            ],
            activeToolUseIds: new Set([...t.activeToolUseIds, action.toolUseId]),
          }))
          return { ...s, turns }
        }),
      }

    case 'TOOL_USE_COMPLETED':
      return {
        ...state,
        slots: state.slots.map((s) => {
          if (s.slot !== action.slot) return s
          const turns = updateTurn(s.turns, action.turnId, (t) => {
            const activeToolUseIds = new Set(t.activeToolUseIds)
            activeToolUseIds.delete(action.toolUseId)
            return {
              ...t,
              responseBlocks: t.responseBlocks.map((b) =>
                b.type === 'tool_started' && b.toolUseId === action.toolUseId
                  ? {
                      type: 'tool_completed' as const,
                      toolUseId: action.toolUseId,
                      toolName: action.toolName,
                      summary: action.summary,
                      durationMs: action.durationMs,
                      ok: action.ok,
                    }
                  : b
              ),
              activeToolUseIds,
            }
          })
          return { ...s, turns }
        }),
      }

    case 'TURN_COMPLETED':
      return {
        ...state,
        slots: state.slots.map((s) => {
          if (s.slot !== action.slot) return s
          const turns = updateTurn(s.turns, action.turnId, (t) => ({
            ...t,
            completed: true,
            stopReason: action.stopReason,
            activeToolUseIds: new Set<string>(),
          }))
          return { ...s, turns, activeTurnId: undefined }
        }),
      }

    case 'SET_FOCUS':
      return { ...state, focusedSlot: action.slot }

    default:
      return state
  }
}
