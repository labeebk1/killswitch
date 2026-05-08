import { useReducer, useCallback, useRef, useState } from 'react'
import { matchReducer, initialMatchState } from '../types/match-state'
import type { MatchAction, Turn } from '../types/match-state'
import type { MatchEventKind } from '../types/ws-events'
import { useCliWebSocket } from './useCliWebSocket'
import type { CliWsStatus } from './useCliWebSocket'
import { ResponseStream } from '../components/slot/ResponseStream'
import { MatchTimer } from '../components/shared/MatchTimer'

// CLI injects context via window global or URL params
interface CliContext {
  matchId: string
  slot: number
  displayName?: string
}

function getCliContext(): CliContext {
  if (typeof window !== 'undefined') {
    const w = window as Window & { __KILLSWITCH_CONTEXT__?: CliContext }
    if (w.__KILLSWITCH_CONTEXT__) return w.__KILLSWITCH_CONTEXT__
  }
  const params = new URLSearchParams(window.location.search)
  return {
    matchId: params.get('matchId') ?? 'unknown',
    slot: parseInt(params.get('slot') ?? '0', 10),
    displayName: params.get('name') ?? undefined,
  }
}

const ctx = getCliContext()
const PLACEHOLDER_MATCH_ID = ctx.matchId

const STATUS_COLORS: Record<CliWsStatus, string> = {
  connecting: 'text-yellow-400',
  connected: 'text-emerald-400',
  reconnecting: 'text-orange-400',
  disconnected: 'text-red-400',
}

function eventToAction(event: MatchEventKind): MatchAction | null {
  switch (event.kind) {
    case 'match.started':
      return { type: 'MATCH_STARTED', startedAt: event.startedAt, durationSec: event.durationSec, endsAt: event.endsAt }
    case 'match.ended':
      return { type: 'MATCH_ENDED', endedAt: event.endedAt, reason: event.reason }
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

export function App() {
  const [wsStatus, setWsStatus] = useState<CliWsStatus>('connecting')
  const [state, dispatch] = useReducer(matchReducer, PLACEHOLDER_MATCH_ID, initialMatchState)
  const [promptText, setPromptText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleEvent = useCallback((event: MatchEventKind) => {
    const action = eventToAction(event)
    if (action) dispatch(action)
  }, [])

  useCliWebSocket({ onEvent: handleEvent, onStatus: setWsStatus })

  const mySlot = state.slots[ctx.slot]
  const isLive = state.matchStatus === 'live'
  const isEnded = state.matchStatus === 'ended'
  const hasTurnInFlight = !!mySlot?.activeTurnId
  const canSubmit = isLive && !hasTurnInFlight && promptText.trim().length > 0 && wsStatus === 'connected'

  const handleSubmit = useCallback(async () => {
    const text = promptText.trim()
    if (!canSubmit || !text) return
    setPromptText('')
    textareaRef.current?.focus()
    try {
      await fetch('http://localhost:3100/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
    } catch {
      // CLI may respond with an error; the WS stream confirms success
    }
  }, [canSubmit, promptText])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const turns: Turn[] = mySlot?.turns ?? []

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold">⚡ Killswitch</span>
          <span className="text-xs text-slate-500">
            {ctx.displayName ?? `Slot ${ctx.slot + 1}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isLive && state.endsAt && <MatchTimer endsAt={state.endsAt} />}
          <span className={`text-xs ${STATUS_COLORS[wsStatus]}`}>
            {wsStatus === 'connected' ? '● Connected' : wsStatus === 'reconnecting' ? '⟳ Reconnecting…' : '○ Connecting…'}
          </span>
        </div>
      </header>

      {/* Match status banner */}
      {state.matchStatus === 'lobby' && (
        <div className="shrink-0 bg-slate-800/50 border-b border-slate-700 px-4 py-2 text-sm text-slate-400 text-center">
          Waiting for match to start…
        </div>
      )}
      {isEnded && (
        <div className="shrink-0 bg-indigo-900/50 border-b border-indigo-700 px-4 py-2 text-sm text-indigo-300 text-center">
          Match ended — thanks for playing!
        </div>
      )}

      {/* Conversation history */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {turns.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            {isLive ? 'Type a prompt below to get started.' : 'Waiting for match to start…'}
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.turnId} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-indigo-600/70 text-white text-sm rounded-2xl rounded-br-sm px-3 py-2 break-words">
                {turn.promptText}
              </div>
            </div>
            <ResponseStream turn={turn} isActive={turn.turnId === mySlot?.activeTurnId} />
          </div>
        ))}
      </div>

      {/* Prompt input */}
      <div className="shrink-0 border-t border-slate-800 p-3">
        <div className={`flex gap-2 rounded-xl border p-2 transition-colors ${
          isLive && wsStatus === 'connected'
            ? 'border-slate-700 bg-slate-800'
            : 'border-slate-800 bg-slate-900 opacity-60'
        }`}>
          <textarea
            ref={textareaRef}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isLive || isEnded || wsStatus !== 'connected'}
            placeholder={
              !isLive
                ? 'Waiting for match to start…'
                : hasTurnInFlight
                ? 'Waiting for response…'
                : 'Describe what to build (⌘↵ to submit)'
            }
            rows={3}
            className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="self-end px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white"
          >
            {hasTurnInFlight ? (
              <span className="animate-pulse">…</span>
            ) : (
              'Send'
            )}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1 text-right">⌘↵ to submit</p>
      </div>
    </div>
  )
}
