'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface WsMessage {
  type: string
  message?: {
    id: string
    topic_id: string
    sender_id: string
    sender_type?: string
    content_type?: string
    semantic_type?: string
    content: string
    created_at: string
  }
}

interface UseWebSocketOptions {
  url: string
  enabled?: boolean
  onMessage?: (msg: WsMessage) => void
  heartbeatInterval?: number
  reconnectDelay?: number
  maxReconnectDelay?: number
}

type WsState = 'connecting' | 'connected' | 'disconnected'

export function useWebSocket({
  url,
  enabled = true,
  onMessage,
  heartbeatInterval = 30000,
  reconnectDelay = 2000,
  maxReconnectDelay = 30000,
}: UseWebSocketOptions) {
  const [state, setState] = useState<WsState>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      if (wsRef.current.readyState <= 1) wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!enabled || !url) return
    cleanup()
    setState('connecting')

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setState('connected')
      retryRef.current = 0
      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping')
      }, heartbeatInterval)
    }

    ws.onmessage = (event) => {
      if (event.data === 'pong') return
      try {
        const parsed: WsMessage = JSON.parse(event.data)
        onMessageRef.current?.(parsed)
      } catch { /* ignore non-JSON */ }
    }

    ws.onclose = () => {
      setState('disconnected')
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      // Reconnect with exponential backoff
      const delay = Math.min(reconnectDelay * Math.pow(1.5, retryRef.current), maxReconnectDelay)
      retryRef.current++
      reconnectRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => { /* onclose will fire next */ }
  }, [url, enabled, cleanup, heartbeatInterval, reconnectDelay, maxReconnectDelay])

  useEffect(() => {
    if (enabled && url) connect()
    return cleanup
  }, [enabled, url, connect, cleanup])

  return { state }
}
