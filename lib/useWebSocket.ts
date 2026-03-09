'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface WsMessage {
  type: string
  request_id?: string
  ok?: boolean
  data?: unknown
  error?: string
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

export type WsAction =
  | 'list' | 'find' | 'join' | 'leave' | 'subscribed'
  | 'publish' | 'poll' | 'p2p' | 'history' | 'detail'

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface UseWebSocketOptions {
  url: string
  enabled?: boolean
  token?: string
  onMessage?: (msg: WsMessage) => void
  heartbeatInterval?: number
  reconnectDelay?: number
  maxReconnectDelay?: number
  actionTimeout?: number
}

type WsState = 'connecting' | 'connected' | 'disconnected'

let _reqCounter = 0
function nextRequestId(): string {
  return `ws-${++_reqCounter}-${Date.now().toString(36)}`
}

export function useWebSocket({
  url,
  enabled = true,
  token,
  onMessage,
  heartbeatInterval = 30000,
  reconnectDelay = 2000,
  maxReconnectDelay = 30000,
  actionTimeout = 15000,
}: UseWebSocketOptions) {
  const [state, setState] = useState<WsState>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map())
  const mountedRef = useRef(true)
  const tokenRef = useRef(token)
  onMessageRef.current = onMessage
  tokenRef.current = token

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }
    // Reject all pending requests
    pendingRef.current.forEach((p) => {
      clearTimeout(p.timer)
      p.reject(new Error('WebSocket closed'))
    })
    pendingRef.current.clear()
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
    if (!enabled || !url || !mountedRef.current) return

    // Block ws:// from HTTPS pages (browsers reject mixed content)
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('ws://')) {
      return
    }

    cleanup()
    setState('connecting')

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      // Construction can throw for invalid URLs or mixed-content
      setState('disconnected')
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      // Send auth token as first message (avoids token in URL/logs)
      if (tokenRef.current) {
        ws.send(JSON.stringify({ action: 'auth', token: tokenRef.current }))
      }
      setState('connected')
      retryRef.current = 0
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping')
      }, heartbeatInterval)
    }

    ws.onmessage = (event) => {
      if (event.data === 'pong') return
      try {
        const parsed: WsMessage = JSON.parse(event.data)

        // Route action_result to pending promise
        if (parsed.type === 'action_result' && parsed.request_id) {
          const pending = pendingRef.current.get(parsed.request_id)
          if (pending) {
            clearTimeout(pending.timer)
            pendingRef.current.delete(parsed.request_id)
            if (parsed.ok) {
              pending.resolve(parsed.data)
            } else {
              pending.reject(new Error(parsed.error || 'Action failed'))
            }
            return
          }
        }

        // Push messages and other events
        onMessageRef.current?.(parsed)
      } catch { /* ignore non-JSON */ }
    }

    ws.onclose = () => {
      setState('disconnected')
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      // Reject pending requests
      pendingRef.current.forEach((p) => {
        clearTimeout(p.timer)
        p.reject(new Error('WebSocket disconnected'))
      })
      pendingRef.current.clear()
      if (!mountedRef.current) return
      const delay = Math.min(reconnectDelay * Math.pow(1.5, retryRef.current), maxReconnectDelay)
      retryRef.current++
      reconnectRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => { /* onclose will fire next */ }
  }, [url, enabled, cleanup, heartbeatInterval, reconnectDelay, maxReconnectDelay])

  useEffect(() => {
    mountedRef.current = true
    if (enabled && url) connect()
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [enabled, url, connect, cleanup])

  /**
   * Send an action via WebSocket and await the result.
   * Returns the result data on success.
   * Returns null if WS is not connected (caller should fall back to HTTP).
   * Throws on server error or timeout.
   */
  const sendAction = useCallback(
    async <T = unknown>(action: WsAction, payload?: Record<string, unknown>): Promise<T | null> => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return null

      const requestId = nextRequestId()
      const msg = JSON.stringify({ action, request_id: requestId, ...payload })

      return new Promise<T | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(requestId)
          reject(new Error(`WS action '${action}' timed out`))
        }, actionTimeout)

        pendingRef.current.set(requestId, {
          resolve: resolve as (data: unknown) => void,
          reject,
          timer,
        })
        ws.send(msg)
      })
    },
    [actionTimeout],
  )

  return { state, sendAction }
}
