interface Props {
  displayName?: string
  lastSeenAt?: string
}

export function DisconnectOverlay({ displayName, lastSeenAt }: Props) {
  const name = displayName ?? 'Competitor'
  const ago = lastSeenAt
    ? Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 1000)
    : null

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm gap-2">
      <span className="text-3xl">⚡</span>
      <p className="text-white font-semibold">{name} disconnected</p>
      {ago !== null && (
        <p className="text-slate-400 text-xs">{ago}s ago — reconnecting…</p>
      )}
    </div>
  )
}
