import { useReducer, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { matchReducer, initialMatchState } from '../types/match-state'
import type { MatchAction } from '../types/match-state'
import type { MatchEventKind } from '../types/ws-events'
import { useMatchWebSocket } from '../hooks/useMatchWebSocket'
import { metaChannel, promptChannel, responseChannel, wsUrl } from '../lib/utils'
import { LobbyView } from '../components/viewer/LobbyView'
import { LiveView } from '../components/viewer/LiveView'
import { EndedView } from '../components/viewer/EndedView'
import { MatchTimer } from '../components/shared/MatchTimer'
import { ConnectionBadge } from '../components/shared/ConnectionBadge'
import type { ConnectionStatus } from '../hooks/useMatchWebSocket'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.killswitch.bonecho.ai'

const ALL_SLOTS = [0, 1, 2, 3]

function eventToAction(event: MatchEventKind): MatchAction | null {
  switch (event.kind) {
    case 'match.lobby_state':
      return { type: 'LOBBY_STATE', slots: event.slots }
    case 'match.started':
      return { type: 'MATCH_STARTED', startedAt: event.startedAt, durationSec: event.durationSec, endsAt: event.endsAt }
    case 'match.ended':
      return { type: 'MATCH_ENDED', endedAt: event.endedAt, reason: event.reason }
    case 'match.slot_disconnected':
      return { type: 'SLOT_DISCONNECTED', slot: event.slot, lastSeenAt: event.lastSeenAt }
    case 'match.slot_reconnected':
      return { type: 'SLOT_RECONNECTED', slot: event.slot }
    case 'tunnel.connected':
      return { type: 'TUNNEL_CONNECTED', slot: event.slot }
    case 'tunnel.disconnected':
      return { type: 'TUNNEL_DISCONNECTED', slot: event.slot }
    case 'tunnel.upstream_error':
      return { type: 'TUNNEL_ERROR', slot: event.slot, status: event.status, ts: event.ts }
    case 'prompt.submitted':
      return { type: 'PROMPT_SUBMITTED', slot: event.slot, turnId: event.turnId, text: event.text, ts: event.ts }
    case 'response.text_delta':
      return { type: 'TEXT_DELTA', slot: event.slot, turnId: event.turnId, text: event.text }
    case 'response.tool_use_started':
      return { type: 'TOOL_USE_STARTED', slot: event.slot, turnId: event.turnId, toolUseId: event.toolUseId, toolName: event.toolName }
    case 'response.tool_use_completed':
      return { type: 'TOOL_USE_COMPLETED', slot: event.slot, turnId: event.turnId, toolUseId: event.toolUseId, toolName: event.toolName, summary: event.summary, durationMs: event.durationMs, ok: event.ok }
    case 'response.turn_completed':
      return { type: 'TURN_COMPLETED', slot: event.slot, turnId: event.turnId, stopReason: event.stopReason }
    default:
      return null
  }
}

export function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>()

  if (!matchId) return <div className="text-red-400 p-8">No match ID in URL</div>

  const [state, dispatch] = useReducer(matchReducer, matchId, initialMatchState)

  const channels = [
    metaChannel(matchId),
    ...ALL_SLOTS.flatMap((s) => [promptChannel(matchId, s), responseChannel(matchId, s)]),
  ]

  const handleEvent = useCallback((event: MatchEventKind) => {
    const action = eventToAction(event)
    if (action) dispatch(action)
  }, [])

  const handleStatus = useCallback((status: ConnectionStatus) => {
    dispatch({ type: 'WS_STATUS', status })
  }, [])

  useMatchWebSocket({
    url: wsUrl(API_BASE, matchId),
    channels,
    onEvent: handleEvent,
    onStatusChange: handleStatus,
  })

  const handleFocus = useCallback((slot: number) => {
    dispatch({ type: 'SET_FOCUS', slot })
  }, [])

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight text-white">⚡ Killswitch</span>
          <span className="text-xs text-slate-500 font-mono truncate hidden sm:block">{matchId}</span>
        </div>
        <div className="flex items-center gap-4">
          {state.matchStatus === 'live' && state.endsAt && (
            <MatchTimer endsAt={state.endsAt} />
          )}
          <ConnectionBadge status={state.connectionStatus} />
        </div>
      </header>

      {/* Body */}
      {state.matchStatus === 'connecting' && (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Connecting to match…
        </div>
      )}

      {state.matchStatus === 'lobby' && (
        <LobbyView slots={state.slots} />
      )}

      {state.matchStatus === 'live' && (
        <LiveView
          slots={state.slots}
          matchId={matchId}
          focusedSlot={state.focusedSlot}
          onFocus={handleFocus}
        />
      )}

      {state.matchStatus === 'ended' && (
        <EndedView
          slots={state.slots}
          matchId={matchId}
          endReason={state.endReason}
          focusedSlot={state.focusedSlot}
          onFocus={handleFocus}
        />
      )}
    </div>
  )
}
