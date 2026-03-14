'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Tool = 'pen' | 'rect' | 'circle' | 'arrow' | 'text' | 'highlight' | 'select'
type AnnotationItem = {
  id: string
  tool: Tool
  color: string
  lineWidth: number
  opacity: number
  points?: { x: number; y: number }[]       // pen / highlight
  rect?: { x: number; y: number; w: number; h: number }  // rect / circle / text / highlight-rect
  text?: string
}

interface AnnotationOverlayProps {
  storageKey: string
  className?: string
  /** When true, auto-expand the toolbar */
  showToolbar?: boolean
  /** @deprecated No longer needed — canvas sizes to parent relative wrapper */
  scrollContainerRef?: React.RefObject<HTMLElement | null>
}

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#000000']

export default function AnnotationOverlay({ storageKey, className, showToolbar: showToolbarProp }: AnnotationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#ef4444')
  const [lineWidth, setLineWidth] = useState(2)
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([])
  const [drawing, setDrawing] = useState(false)
  const [current, setCurrent] = useState<AnnotationItem | null>(null)
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const [showToolbar, setShowToolbar] = useState(false)
  const [history, setHistory] = useState<AnnotationItem[][]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  // Sync external showToolbar prop
  useEffect(() => {
    if (showToolbarProp) setShowToolbar(true)
  }, [showToolbarProp])

  // Load annotations from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`annot:${storageKey}`)
      if (raw) {
        const parsed = JSON.parse(raw) as AnnotationItem[]
        setAnnotations(parsed)
        setHistory([parsed])
        setHistoryIdx(0)
      }
    } catch {}
  }, [storageKey])

  // Save annotations to localStorage
  const persist = useCallback((items: AnnotationItem[]) => {
    try { localStorage.setItem(`annot:${storageKey}`, JSON.stringify(items)) } catch {}
  }, [storageKey])

  const pushHistory = useCallback((items: AnnotationItem[]) => {
    setHistory(prev => {
      const next = [...prev.slice(0, historyIdx + 1), items]
      return next.length > 50 ? next.slice(-50) : next
    })
    setHistoryIdx(prev => prev + 1)
  }, [historyIdx])

  const undo = useCallback(() => {
    if (historyIdx <= 0) return
    const prev = history[historyIdx - 1]
    setAnnotations(prev)
    setHistoryIdx(i => i - 1)
    persist(prev)
  }, [history, historyIdx, persist])

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return
    const next = history[historyIdx + 1]
    setAnnotations(next)
    setHistoryIdx(i => i + 1)
    persist(next)
  }, [history, historyIdx, persist])

  // Resize canvas to match the inner relative wrapper (which has the full content height)
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const w = container.offsetWidth
    const h = container.offsetHeight
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
  }, [])

  useEffect(() => {
    syncCanvasSize()
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => syncCanvasSize())
    ro.observe(el)
    const mo = new MutationObserver(() => setTimeout(syncCanvasSize, 200))
    mo.observe(el, { childList: true, subtree: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [syncCanvasSize])

  // Redraw all annotations
  useEffect(() => {
    syncCanvasSize()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const toDraw = [...annotations, ...(current ? [current] : [])]
    for (const a of toDraw) {
      ctx.save()
      ctx.strokeStyle = a.color
      ctx.fillStyle = a.color
      ctx.lineWidth = a.lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = a.opacity

      if ((a.tool === 'pen') && a.points && a.points.length > 1) {
        ctx.beginPath()
        ctx.moveTo(a.points[0].x, a.points[0].y)
        for (let i = 1; i < a.points.length; i++) {
          ctx.lineTo(a.points[i].x, a.points[i].y)
        }
        ctx.stroke()
      }

      if (a.tool === 'highlight' && a.rect) {
        ctx.globalAlpha = 0.25
        ctx.fillRect(a.rect.x, a.rect.y, a.rect.w, a.rect.h)
      }

      if (a.tool === 'rect' && a.rect) {
        ctx.strokeRect(a.rect.x, a.rect.y, a.rect.w, a.rect.h)
      }

      if (a.tool === 'circle' && a.rect) {
        const cx = a.rect.x + a.rect.w / 2
        const cy = a.rect.y + a.rect.h / 2
        const rx = Math.abs(a.rect.w) / 2
        const ry = Math.abs(a.rect.h) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      if (a.tool === 'arrow' && a.rect) {
        const { x, y, w, h } = a.rect
        const ex = x + w, ey = y + h
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        // arrowhead
        const angle = Math.atan2(h, w)
        const headLen = 12
        ctx.beginPath()
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4))
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4))
        ctx.stroke()
      }

      if (a.tool === 'text' && a.rect && a.text) {
        ctx.globalAlpha = 1
        ctx.font = `${Math.max(14, a.lineWidth * 6)}px sans-serif`
        ctx.fillText(a.text, a.rect.x, a.rect.y + Math.max(14, a.lineWidth * 6))
      }

      ctx.restore()
    }
  }, [annotations, current])

  const getPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'select') return
    e.preventDefault()
    e.stopPropagation()
    const pos = getPos(e)

    if (tool === 'text') {
      setTextInput(pos)
      setTextValue('')
      return
    }

    setDrawing(true)
    const item: AnnotationItem = {
      id: crypto.randomUUID(),
      tool,
      color,
      lineWidth,
      opacity: tool === 'highlight' ? 0.25 : 1,
    }
    if (tool === 'pen') {
      item.points = [pos]
    } else {
      item.rect = { x: pos.x, y: pos.y, w: 0, h: 0 }
    }
    setCurrent(item)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !current) return
    e.preventDefault()
    const pos = getPos(e)
    if (current.tool === 'pen' && current.points) {
      setCurrent({ ...current, points: [...current.points, pos] })
    } else if (current.rect) {
      setCurrent({
        ...current,
        rect: { ...current.rect, w: pos.x - current.rect.x, h: pos.y - current.rect.y },
      })
    }
  }

  const handleMouseUp = () => {
    if (!drawing || !current) return
    setDrawing(false)
    // Ignore tiny accidental draws
    if (current.tool === 'pen' && (current.points?.length || 0) < 3) { setCurrent(null); return }
    if (current.rect && Math.abs(current.rect.w) < 3 && Math.abs(current.rect.h) < 3) { setCurrent(null); return }

    const next = [...annotations, current]
    setAnnotations(next)
    pushHistory(next)
    persist(next)
    setCurrent(null)
  }

  const confirmText = () => {
    if (!textInput || !textValue.trim()) { setTextInput(null); return }
    const item: AnnotationItem = {
      id: crypto.randomUUID(),
      tool: 'text',
      color,
      lineWidth,
      opacity: 1,
      rect: { x: textInput.x, y: textInput.y, w: 0, h: 0 },
      text: textValue.trim(),
    }
    const next = [...annotations, item]
    setAnnotations(next)
    pushHistory(next)
    persist(next)
    setTextInput(null)
    setTextValue('')
  }

  const clearAll = () => {
    if (!annotations.length || !confirm('Clear all annotations?')) return
    const next: AnnotationItem[] = []
    setAnnotations(next)
    pushHistory(next)
    persist(next)
  }

  const tools: { id: Tool; icon: string; label: string }[] = [
    { id: 'select', icon: '👆', label: 'Select (no drawing)' },
    { id: 'pen', icon: '✏️', label: 'Pen' },
    { id: 'highlight', icon: '🖍️', label: 'Highlight' },
    { id: 'rect', icon: '▢', label: 'Rectangle' },
    { id: 'circle', icon: '◯', label: 'Circle / Ellipse' },
    { id: 'arrow', icon: '➤', label: 'Arrow' },
    { id: 'text', icon: 'T', label: 'Text' },
  ]

  return (
    <>
      {/* Toolbar — in normal flow, sticky so it stays visible during scroll */}
      <div className="sticky top-0 left-0 z-30 p-2" style={{ pointerEvents: 'auto', marginBottom: '-40px' }}>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 px-1 py-1 shadow-lg backdrop-blur">
          {!showToolbar ? (
            <button onClick={() => setShowToolbar(true)} className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100" title="Show annotation tools">
              🖊️ Annotate
            </button>
          ) : (
            <>
              {tools.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  className={`rounded px-1.5 py-1 text-sm transition ${tool === t.id ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' : 'text-slate-600 hover:bg-slate-100'}`}
                  title={t.label}
                >
                  {t.icon}
                </button>
              ))}
              <span className="mx-0.5 h-5 w-px bg-slate-200" />
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-5 w-5 rounded-full border-2 transition ${color === c ? 'border-slate-700 scale-110' : 'border-transparent hover:border-slate-300'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <span className="mx-0.5 h-5 w-px bg-slate-200" />
              <select
                value={lineWidth}
                onChange={e => setLineWidth(+e.target.value)}
                className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600"
                title="Line width"
              >
                <option value={1}>Thin</option>
                <option value={2}>Medium</option>
                <option value={4}>Thick</option>
                <option value={6}>Bold</option>
              </select>
              <span className="mx-0.5 h-5 w-px bg-slate-200" />
              <button onClick={undo} className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100" title="Undo">↩</button>
              <button onClick={redo} className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100" title="Redo">↪</button>
              <button onClick={clearAll} className="rounded px-1.5 py-1 text-xs text-red-400 hover:bg-red-50" title="Clear all">🗑</button>
              <button onClick={() => { setShowToolbar(false); setTool('select') }} className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100" title="Close toolbar">✕</button>
            </>
          )}
        </div>
        {annotations.length > 0 && !showToolbar && (
          <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 shadow">
            {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Canvas overlay — absolute over the relative content wrapper */}
      <div ref={containerRef} className={`absolute inset-0 ${className || ''}`} style={{ pointerEvents: tool === 'select' ? 'none' : 'auto' }}>
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 z-10"
          style={{ cursor: tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* Text input popup */}
        {textInput && (
          <div className="absolute z-20 rounded-lg border border-slate-300 bg-white p-2 shadow-xl" style={{ left: textInput.x, top: textInput.y }}>
            <input
              autoFocus
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmText(); if (e.key === 'Escape') setTextInput(null) }}
              className="w-48 rounded border border-slate-200 px-2 py-1 text-sm"
              placeholder="Type annotation..."
            />
            <div className="mt-1 flex gap-1">
              <button onClick={confirmText} className="rounded bg-indigo-500 px-2 py-0.5 text-[10px] text-white">Add</button>
              <button onClick={() => setTextInput(null)} className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
