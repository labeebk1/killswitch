import type { SlotState } from '../../types/match-state'
import { slotLabel } from '../../lib/utils'
import { PromptTranscript } from './PromptTranscript'
import { PreviewIframe } from './PreviewIframe'
import { DisconnectOverlay } from './DisconnectOverlay'

interface Props {
  slot: SlotState
  matchId: string
  /** compact = thumbnail strip; full = focus pane */
  size: 'full' | 'compact'
}

export function SlotPane({ slot, matchId, size }: Props) {
  const label = slot.displayName ?? slotLabel(slot.slot)
  const isCompact = size === 'compact'

  return (
    <div className="relative flex flex-col h-full bg-slate-900 overflow-hidden">
      {/* Disconnect overlay */}
      {slot.slotDisconnected && (
        <DisconnectOverlay displayName={slot.displayName} lastSeenAt={slot.lastSeenAt} />
      )}

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 shrink-0 border-b border-slate-800 ${
          isCompact ? 'py-1' : 'py-2'
        }`}
      >
        <span className={`font-semibold text-slate-200 truncate ${isCompact ? 'text-xs' : 'text-sm'}`}>
          {label}
        </span>
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            slot.slotDisconnected
              ? 'bg-red-500'
              : slot.tunnelConnected
              ? 'bg-emerald-500'
              : 'bg-slate-600'
          }`}
        />
      </div>

      {isCompact ? (
        // Thumbnail: show only the iframe preview
        <div className="flex-1 overflow-hidden">
          <PreviewIframe
            matchId={matchId}
            slot={slot.slot}
            tunnelConnected={slot.tunnelConnected}
            tunnelError={slot.tunnelError}
          />
        </div>
      ) : (
        // Full: split view — transcript left, iframe right
        <div className="flex flex-1 overflow-hidden">
          {/* Transcript panel */}
          <div className="flex flex-col w-[38%] min-w-0 border-r border-slate-800 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <PromptTranscript turns={slot.turns} activeTurnId={slot.activeTurnId} />
            </div>
          </div>

          {/* Preview panel */}
          <div className="flex-1 relative">
            <PreviewIframe
              matchId={matchId}
              slot={slot.slot}
              tunnelConnected={slot.tunnelConnected}
              tunnelError={slot.tunnelError}
            />
          </div>
        </div>
      )}
    </div>
  )
}
