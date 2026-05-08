import type { SlotState } from '../../types/match-state'
import { SlotPane } from '../slot/SlotPane'
import { slotLabel } from '../../lib/utils'

interface Props {
  slots: SlotState[]
  matchId: string
  focusedSlot: number
  onFocus: (slot: number) => void
}

export function LiveView({ slots, matchId, focusedSlot, onFocus }: Props) {
  const primary = slots.find((s) => s.slot === focusedSlot) ?? slots[0]
  const thumbnails = slots.filter((s) => s.slot !== primary.slot)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Primary focus pane */}
      <div className="flex-1 overflow-hidden">
        <SlotPane slot={primary} matchId={matchId} size="full" />
      </div>

      {/* Thumbnail strip */}
      <div className="flex h-36 shrink-0 border-t border-slate-800 bg-slate-950">
        {thumbnails.map((slot) => (
          <button
            key={slot.slot}
            onClick={() => onFocus(slot.slot)}
            className={`flex-1 relative overflow-hidden transition-all focus:outline-none ${
              'border-r border-slate-800 last:border-r-0 hover:brightness-110'
            }`}
            aria-label={`Focus ${slot.displayName ?? slotLabel(slot.slot)}`}
          >
            <SlotPane slot={slot} matchId={matchId} size="compact" />
          </button>
        ))}
      </div>
    </div>
  )
}
