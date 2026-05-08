import { useEffect } from 'react'
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

  // Arrow keys cycle through slots
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        onFocus((focusedSlot + 1) % slots.length)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        onFocus((focusedSlot - 1 + slots.length) % slots.length)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [focusedSlot, slots.length, onFocus])

  return (
    <div className="flex flex-col flex-1 overflow-hidden" role="region" aria-label="Match viewer">
      {/* Primary focus pane */}
      <div className="flex-1 overflow-hidden">
        <SlotPane slot={primary} matchId={matchId} size="full" />
      </div>

      {/* Thumbnail strip */}
      <div
        className="flex h-36 shrink-0 border-t border-slate-800 bg-slate-950"
        role="tablist"
        aria-label="Other slots"
      >
        {thumbnails.map((slot) => (
          <button
            key={slot.slot}
            role="tab"
            aria-selected={false}
            onClick={() => onFocus(slot.slot)}
            className="flex-1 relative overflow-hidden border-r border-slate-800 last:border-r-0 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
            aria-label={`Focus ${slot.displayName ?? slotLabel(slot.slot)}`}
          >
            <SlotPane slot={slot} matchId={matchId} size="compact" />
          </button>
        ))}
      </div>
    </div>
  )
}
