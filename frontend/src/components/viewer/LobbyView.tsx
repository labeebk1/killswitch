import type { SlotState } from '../../types/match-state'
import { slotLabel } from '../../lib/utils'

interface Props {
  slots: SlotState[]
}

function SlotCard({ slot }: { slot: SlotState }) {
  const label = slot.displayName ?? slotLabel(slot.slot)

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border p-6 transition-colors ${
        slot.ready
          ? 'bg-emerald-950/40 border-emerald-700'
          : slot.occupied
          ? 'bg-slate-800/60 border-slate-600'
          : 'bg-slate-900/40 border-slate-700 border-dashed'
      }`}
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
          slot.ready
            ? 'bg-emerald-700 text-white'
            : slot.occupied
            ? 'bg-slate-700 text-slate-200'
            : 'bg-slate-800 text-slate-500'
        }`}
      >
        {slot.slot + 1}
      </div>

      <div className="text-center">
        <p className={`font-semibold ${slot.occupied ? 'text-white' : 'text-slate-500'}`}>
          {slot.occupied ? label : 'Empty'}
        </p>
        <p className={`text-xs mt-0.5 ${slot.ready ? 'text-emerald-400' : 'text-slate-500'}`}>
          {slot.ready ? '✓ Ready' : slot.occupied ? 'Connecting…' : 'Waiting for competitor'}
        </p>
      </div>
    </div>
  )
}

export function LobbyView({ slots }: Props) {
  const readyCount = slots.filter((s) => s.ready).length

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-8 p-8">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-white">Waiting for competitors</h2>
        <p className="text-slate-400 text-sm">
          {readyCount} / {slots.length} ready
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-xl">
        {slots.map((slot) => (
          <SlotCard key={slot.slot} slot={slot} />
        ))}
      </div>
    </div>
  )
}
