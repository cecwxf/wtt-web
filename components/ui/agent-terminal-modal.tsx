'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WS_BASE_URL } from '@/lib/api/base-url'

interface AgentTerminalModalProps {
  agentId: string
  agentName: string
  workdir?: string
  token?: string
  onClose: () => void
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let reqCounter = 0

export function AgentTerminalModal({ agentId, agentName, workdir, token, onClose }: AgentTerminalModalProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<string>('')
  const pendingRef = useRef<Map<string, Pending>>(new Map())
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed' | 'error'>('connecting')
  const [error, setError] = useState('')
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [maximized, setMaximized] = useState(false)

  const wsUrl = useMemo(() => `${WS_BASE_URL.replace(/\/$/, '')}/ws/${encodeURIComponent(agentId)}`, [agentId])

  useEffect(() => {
    const setDefaultSize = () => {
      setSize((prev) => {
        if (prev.width > 0 && prev.height > 0) return prev
        return {
          width: Math.round(window.innerWidth * 0.96),
          height: Math.round(window.innerHeight * 0.94),
        }
      })
    }
    setDefaultSize()
  }, [])

  const fitTerminal = () => {
    try {
      fitRef.current?.fit()
    } catch {
      // ignore transient layout races while dragging
    }
  }

  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const startWidth = shellRef.current?.offsetWidth || size.width || window.innerWidth * 0.96
    const startHeight = shellRef.current?.offsetHeight || size.height || window.innerHeight * 0.94
    const minWidth = Math.min(520, window.innerWidth - 16)
    const minHeight = Math.min(360, window.innerHeight - 16)
    const maxWidth = window.innerWidth - 16
    const maxHeight = window.innerHeight - 16

    const onMove = (move: PointerEvent) => {
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + move.clientX - startX))
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + move.clientY - startY))
      setSize({ width: Math.round(nextWidth), height: Math.round(nextHeight) })
      setMaximized(false)
      requestAnimationFrame(fitTerminal)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      requestAnimationFrame(fitTerminal)
      termRef.current?.focus()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  const toggleMaximized = () => {
    if (maximized) {
      setSize({
        width: Math.round(window.innerWidth * 0.8),
        height: Math.round(window.innerHeight * 0.76),
      })
      setMaximized(false)
    } else {
      setSize({
        width: window.innerWidth - 16,
        height: window.innerHeight - 16,
      })
      setMaximized(true)
    }
    requestAnimationFrame(fitTerminal)
    setTimeout(() => termRef.current?.focus(), 0)
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root || !agentId || !token) return

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.22,
      theme: {
        background: '#0b0f14',
        foreground: '#d6e2ea',
        cursor: '#76f2c4',
        selectionBackground: '#264653',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(root)
    fit.fit()
    term.focus()
    term.writeln('\x1b[36mConnecting to agent shell...\x1b[0m')
    termRef.current = term
    fitRef.current = fit

    let closed = false
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    const pendingMap = pendingRef.current

    const sendAction = (action: string, payload: Record<string, unknown> = {}, timeoutMs = 8000) => {
      if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('terminal websocket is not connected'))
      const requestId = `term-${++reqCounter}-${Date.now().toString(36)}`
      const message = { action, request_id: requestId, ...payload }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(requestId)
          reject(new Error(`${action} timed out`))
        }, timeoutMs)
        pendingRef.current.set(requestId, { resolve, reject, timer })
        ws.send(JSON.stringify(message))
      })
    }

    const sendResize = () => {
      const sid = sessionRef.current
      if (!sid || ws.readyState !== WebSocket.OPEN || !termRef.current) return
      sendAction('terminal_resize', {
        session_id: sid,
        cols: termRef.current.cols,
        rows: termRef.current.rows,
        token,
      }, 3000).catch(() => {})
    }

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit()
        sendResize()
      } catch {
        // ignore layout races
      }
    })
    resizeObserver.observe(root)

    const dataDisposable = term.onData((data) => {
      const sid = sessionRef.current
      if (!sid || ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ action: 'terminal_input', session_id: sid, data, token }))
    })

    ws.onopen = async () => {
      try {
        ws.send(JSON.stringify({ action: 'auth', request_id: `auth-${Date.now()}`, token }))
        const opened = await sendAction('terminal_open', {
          token,
          cols: term.cols,
          rows: term.rows,
          cwd: workdir || '',
        }) as { session_id?: string } | null
        const sid = opened?.session_id || ''
        if (!sid) throw new Error('terminal session id missing')
        sessionRef.current = sid
        setStatus('connected')
        term.focus()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'terminal open failed'
        setError(msg)
        setStatus('error')
        term.writeln(`\r\n\x1b[31m${msg}\x1b[0m`)
      }
    }

    ws.onmessage = (event) => {
      if (event.data === 'pong') return
      try {
        const msg = JSON.parse(String(event.data))
        if (msg.type === 'action_result' && msg.request_id) {
          const pending = pendingRef.current.get(msg.request_id)
          if (pending) {
            clearTimeout(pending.timer)
            pendingRef.current.delete(msg.request_id)
            if (msg.ok) pending.resolve(msg.data)
            else pending.reject(new Error(String(msg.error || 'action failed')))
          }
          return
        }
        if (msg.type === 'terminal_output' && msg.session_id === sessionRef.current) {
          term.write(String(msg.data || ''))
          return
        }
        if (msg.type === 'terminal_exit' && msg.session_id === sessionRef.current) {
          term.writeln(`\r\n\x1b[33m[terminal exited: ${msg.exit_code ?? '-'}]\x1b[0m`)
          setStatus('closed')
          return
        }
        if (msg.type === 'terminal_error' && msg.session_id === sessionRef.current) {
          const nextError = String(msg.error || 'terminal error')
          setError(nextError)
          setStatus('error')
          term.writeln(`\r\n\x1b[31m${nextError}\x1b[0m`)
        }
      } catch {
        // ignore non-json messages
      }
    }

    ws.onerror = () => {
      setStatus('error')
      setError('terminal websocket error')
    }
    ws.onclose = () => {
      if (!closed) setStatus('closed')
    }

    return () => {
      closed = true
      const sid = sessionRef.current
      try {
        if (sid && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'terminal_close', session_id: sid, token }))
        }
      } catch {
        // ignore close races
      }
      pendingMap.forEach((pending) => clearTimeout(pending.timer))
      pendingMap.clear()
      resizeObserver.disconnect()
      dataDisposable.dispose()
      ws.close()
      term.dispose()
      wsRef.current = null
      termRef.current = null
      fitRef.current = null
      sessionRef.current = ''
    }
  }, [agentId, token, workdir, wsUrl])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-2">
      <div
        ref={shellRef}
        className="relative flex max-h-[calc(100vh-16px)] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-[#2b3a35] bg-[#0b0f14] shadow-2xl"
        style={{
          width: size.width ? `${size.width}px` : '96vw',
          height: size.height ? `${size.height}px` : '94vh',
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-[#101820] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-100">Terminal · {agentName}</div>
            <div className="mt-1 truncate text-xs text-slate-400" title={workdir || ''}>
              {workdir || 'agent shell'} · runs on the agent host
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
              status === 'connected'
                ? 'bg-emerald-500/15 text-emerald-300'
                : status === 'error'
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-slate-500/15 text-slate-300'
            }`}>
              {status}
            </span>
            <button
              type="button"
              onClick={toggleMaximized}
              className="rounded-lg px-2 py-1 text-xs font-black text-slate-400 transition hover:bg-white/10 hover:text-white"
              title={maximized ? 'Restore terminal size' : 'Maximize terminal'}
            >
              {maximized ? 'restore' : 'max'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              x
            </button>
          </div>
        </div>
        {error && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{error}</div>
        )}
        <div ref={rootRef} className="min-h-0 flex-1 p-2" />
        <button
          type="button"
          aria-label="Resize terminal"
          onPointerDown={handleResizePointerDown}
          className="absolute bottom-1.5 right-1.5 h-5 w-5 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-cyan-300/70 opacity-70 transition hover:opacity-100"
        />
      </div>
    </div>
  )
}
