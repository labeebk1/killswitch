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
const MAX_RETRIES = 10

export function useCliWebSocket({ onEvent, onStatus }: Options) {
  const wsRef = useRef<WebSocket | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const backoffRef = useRef(INITIAL_BACKOFF)
  const retryCountRef = useRef(0)
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
    onStatusRef.current(retryCountRef.current > 0 ? 'reconnecting' : 'connecting')

    const ws = new WebSocket(CLI_WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      backoffRef.current = INITIAL_BACKOFF
      retryCountRef.current = 0
      onStatusRef.current('connected')

      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if (msg?.event) onEventRef.current(msg.event as MatchEventKind)
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
      if (unmountedRef.current) return

      retryCountRef.current += 1
      if (retryCountRef.current >= MAX_RETRIES) {
        onStatusRef.current('disconnected')
        return
      }

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
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
      wsRef.current?.close()
    }
  }, [connect])

  return { send }
}
