export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function slotLabel(slot: number): string {
  return `Slot ${slot + 1}`
}

export function previewUrl(matchId: string, slot: number): string {
  return `https://preview.killswitch.bonecho.ai/m/${matchId}/${slot}/`
}

export function wsUrl(base: string, matchId: string): string {
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/ws/matches/${matchId}`
  return url.toString()
}

export function metaChannel(matchId: string): string {
  return `match:${matchId}:meta`
}

export function promptChannel(matchId: string, slot: number): string {
  return `match:${matchId}:slot:${slot}:prompt`
}

export function responseChannel(matchId: string, slot: number): string {
  return `match:${matchId}:slot:${slot}:response`
}
