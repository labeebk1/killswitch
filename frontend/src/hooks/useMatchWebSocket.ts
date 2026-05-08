import { useEffect, useRef, useCallback } from 'react'
import type { ServerEnvelope, ClientMessage, MatchEventKind } from '../types/ws-events'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface UseMatchWebSocketOptions {
  url: string
  channels: string[]
  onEvent: (event: MatchEventKind, channel: string) => void
  onStatusChange?: (status: ConnectionStatus) => void
  enabled?: boolean
}

const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000
const PING_INTERVAL_MS = 20_000
const MAX_RETRIES = 10

export function useMatchWebSocket({
  url,
  channels,
  onEvent,
  onStatusChange,
  enabled = true,
}: UseMatchWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const channelsRef = useRef<string[]>(channels)
  const onEventRef = useRef(onEvent)
  const onStatusChangeRef = useRef(onStatusChange)
  const backoffRef = useRef(INITIAL_BACKOFF_MS)
  const retryCountRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unmountedRef = useRef(false)

  channelsRef.current = channels
  onEventRef.current = onEvent
  onStatusChangeRef.current = onStatusChange

  const emit = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    onStatusChangeRef.current?.(
      retryCountRef.current > 0 ? 'reconnecting' : 'connecting'
    )

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      backoffRef.current = INITIAL_BACKOFF_MS
      retryCountRef.current = 0
      onStatusChangeRef.current?.('connected')

      for (const channel of channelsRef.current) {
        ws.send(JSON.stringify({ type: 'subscribe', channel } satisfies ClientMessage))
      }

      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' } satisfies ClientMessage))
        }
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (ev) => {
      let envelope: ServerEnvelope
      try {
        envelope = JSON.parse(ev.data as string) as ServerEnvelope
      } catch {
        return
      }
      if (envelope?.event) {
        try {
          onEventRef.current(envelope.event, envelope.channel)
        } catch {
          // malformed event — don't crash the WS connection
        }
      }
    }

    ws.onclose = () => {
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
      if (unmountedRef.current) return

      retryCountRef.current += 1
      if (retryCountRef.current >= MAX_RETRIES) {
        onStatusChangeRef.current?.('disconnected')
        return
      }

      onStatusChangeRef.current?.('reconnecting')
      reconnectTimerRef.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
        connect()
      }, backoffRef.current)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [url])

  const subscribeChannels = useCallback((newChannels: string[]) => {
    for (const ch of newChannels) {
      emit({ type: 'subscribe', channel: ch })
    }
  }, [emit])

  useEffect(() => {
    if (!enabled) return
    unmountedRef.current = false
    connect()
    return () => {
      unmountedRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      wsRef.current?.close()
    }
  }, [enabled, connect])

  return { emit, subscribeChannels }
}
