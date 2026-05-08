import type { SlotState } from '../../types/match-state'
import { SlotPane } from '../slot/SlotPane'

interface Props {
  slots: SlotState[]
  matchId: string
  endReason?: string
  focusedSlot: number
  onFocus: (slot: number) => void
}

const REASON_LABELS: Record<string, string> = {
  timer: 'Time\'s up!',
  host_cancel: 'Match cancelled by host',
  all_disconnected: 'All competitors disconnected',
}

export function EndedView({ slots, matchId, endReason, focusedSlot, onFocus }: Props) {
  const primary = slots.find((s) => s.slot === focusedSlot) ?? slots[0]
  const thumbnails = slots.filter((s) => s.slot !== primary.slot)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* End banner */}
      <div className="shrink-0 bg-indigo-900/60 border-b border-indigo-700 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-white text-sm">
          {REASON_LABELS[endReason ?? ''] ?? 'Match ended'}
        </span>
        <span className="text-xs text-indigo-300">Previews frozen at final state</span>
      </div>

      {/* Reuse live layout */}
      <div className="flex-1 overflow-hidden">
        <SlotPane slot={primary} matchId={matchId} size="full" />
      </div>

      <div className="flex h-36 shrink-0 border-t border-slate-800 bg-slate-950">
        {thumbnails.map((slot) => (
          <button
            key={slot.slot}
            onClick={() => onFocus(slot.slot)}
            className="flex-1 relative overflow-hidden border-r border-slate-800 last:border-r-0 hover:brightness-110 focus:outline-none"
            aria-label={`View slot ${slot.slot + 1}`}
          >
            <SlotPane slot={slot} matchId={matchId} size="compact" />
          </button>
        ))}
      </div>
    </div>
  )
}
