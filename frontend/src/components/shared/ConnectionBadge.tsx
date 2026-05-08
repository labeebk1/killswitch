import type { ConnectionStatus } from '../../hooks/useMatchWebSocket'

interface Props {
  status: ConnectionStatus
}

const labels: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Live',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
}

const dotColors: Record<ConnectionStatus, string> = {
  connecting: 'bg-yellow-500',
  connected: 'bg-emerald-500',
  reconnecting: 'bg-orange-500',
  disconnected: 'bg-red-500',
}

export function ConnectionBadge({ status }: Props) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${labels[status]}`}
      className="flex items-center gap-1.5 text-xs text-slate-400"
    >
      <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${dotColors[status]}`} />
      {labels[status]}
    </span>
  )
}
