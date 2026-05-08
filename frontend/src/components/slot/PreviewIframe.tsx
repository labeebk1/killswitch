import { previewUrl } from '../../lib/utils'

interface Props {
  matchId: string
  slot: number
  tunnelConnected: boolean
  tunnelError?: { status: number; ts: string }
}

export function PreviewIframe({ matchId, slot, tunnelConnected, tunnelError }: Props) {
  const src = previewUrl(matchId, slot)

  if (!tunnelConnected && !tunnelError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-500 text-sm">
        <span>Waiting for tunnel…</span>
      </div>
    )
  }

  if (tunnelError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 text-sm gap-2">
        <span className="text-2xl">⚠️</span>
        <span>Preview unavailable (HTTP {tunnelError.status})</span>
        <span className="text-xs text-slate-600">Dev server may not be running on :3000</span>
      </div>
    )
  }

  return (
    <iframe
      src={src}
      // Exact sandbox value per plan — do NOT add allow-top-navigation, allow-popups,
      // allow-modals, or allow-pointer-lock. allow-same-origin is safe because the
      // preview origin (preview.killswitch.bonecho.ai) is distinct from the viewer host.
      sandbox="allow-scripts allow-same-origin allow-forms"
      className="w-full h-full border-0 bg-white"
      title={`Slot ${slot + 1} preview`}
    />
  )
}
