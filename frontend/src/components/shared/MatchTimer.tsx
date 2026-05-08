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
    <span className={`tabular-nums font-mono text-sm ${isLow ? 'text-red-400' : 'text-slate-300'}`}>
      {formatDuration(remaining)}
    </span>
  )
}
