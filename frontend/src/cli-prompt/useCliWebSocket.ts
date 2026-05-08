import { useEffect, useRef, useCallback } from 'react'
import type { MatchEventKind, ClientMessage } from '../types/ws-events'

export type CliWsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface Options {
  onEvent: (event: MatchEventKind) => void
  onStatus: (s: CliWsStatus) => void
}

const CLI_WS_URL = 'ws://localhost:3100/ws'
const PING_INTERVAL_MS = 15_000
const INITIAL_BACKOFF = 1_000
const MAX_BACKOFF = 15_000

export function useCliWebSocket({ onEvent, onStatus }: Options) {
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(INITIAL_BACKOFF)
  const unmountedRef = useRef(false)
  const onEventRef = useRef(onEvent)
  const onStatusRef = useRef(onStatus)
  onEventRef.current = onEvent
  onStatusRef.current = onStatus

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const connect = useCallback(() => {
    if (unmountedRef.current) return
    onStatusRef.current(backoffRef.current > INITIAL_BACKOFF ? 'reconnecting' : 'connecting')

    const ws = new WebSocket(CLI_WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      backoffRef.current = INITIAL_BACKOFF
      onStatusRef.current('connected')
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
        else clearInterval(ping)
      }, PING_INTERVAL_MS)
      ;(ws as WebSocket & { _ping?: ReturnType<typeof setInterval> })._ping = ping
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if (msg?.event) onEventRef.current(msg.event as MatchEventKind)
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      if (unmountedRef.current) return
      onStatusRef.current('reconnecting')
      setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
        connect()
      }, backoffRef.current)
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    unmountedRef.current = false
    connect()
    return () => {
      unmountedRef.current = true
      wsRef.current?.close()
    }
  }, [connect])

  return { send }
}
