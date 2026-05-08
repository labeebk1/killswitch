import { useEffect, useState } from 'react'
import { formatDuration } from '../../lib/utils'

interface Props {
  endsAt: string
}

export function MatchTimer({ endsAt }: Props) {
  const [remaining, setRemaining] = useState(() => new Date(endsAt).getTime() - Date.now())

  useEffect(() => {
    const tick = () => setRemaining(new Date(endsAt).getTime() - Date.now())
    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [endsAt])

  const isLow = remaining < 5 * 60 * 1_000
  return (
    <span
      aria-live="polite"
      aria-label={`Time remaining: ${formatDuration(remaining)}${isLow ? ', low time' : ''}`}
      className={`flex items-center gap-1 tabular-nums font-mono text-sm ${isLow ? 'text-red-400' : 'text-slate-300'}`}
    >
      {isLow && <span aria-hidden="true" className="text-xs font-sans font-semibold">LOW</span>}
      {formatDuration(remaining)}
    </span>
  )
}
