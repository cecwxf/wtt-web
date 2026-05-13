'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { WhiteboardOp } from '@/lib/arena/whiteboard'

const Excalidraw = dynamic(async () => (await import('@excalidraw/excalidraw')).Excalidraw, { ssr: false })

type Locale = 'zh' | 'en'

type Props = {
  challengeId: string
  locale: Locale
  ops?: WhiteboardOp[]
  renderMode?: 'full' | 'step'
  busy?: boolean
  onExplain?: () => void
  onStep?: () => void
}

type BoxRect = { id: string; x: number; y: number; w: number; h: number }
const defaultAppState = {
  viewBackgroundColor: '#f8fafc',
  currentItemStrokeColor: '#0f172a',
  currentItemBackgroundColor: 'transparent',
  currentItemFontFamily: 1,
  currentItemFontSize: 20,
}

function safeText(value: unknown, fallback = '') {
  return String(value ?? fallback).slice(0, 1200)
}

function fontSize(size?: 'sm' | 'md' | 'lg') {
  if (size === 'sm') return 18
  if (size === 'lg') return 32
  return 22
}

function makeArrowId(index: number) {
  return `wb-arrow-${index}`
}

function layoutWhiteboardOps(ops: WhiteboardOp[]) {
  let boxIndex = 0
  let sectionIndex = 0
  let textIndex = 0
  const boxSlots = [
    { x: 80, y: 145 },
    { x: 350, y: 145 },
    { x: 620, y: 145 },
    { x: 890, y: 145 },
    { x: 1160, y: 145 },
    { x: 620, y: 285 },
  ]
  const sectionSlots = [
    { x: 90, y: 365 },
    { x: 700, y: 365 },
    { x: 90, y: 590 },
    { x: 700, y: 590 },
  ]
  return ops.map((op): WhiteboardOp => {
    if (op.type === 'title') return { ...op, x: 70, y: 45 }
    if (op.type === 'text') {
      const y = textIndex === 0 ? 92 : 650 + textIndex * 34
      textIndex += 1
      return { ...op, x: 80, y, size: op.size || 'sm' }
    }
    if (op.type === 'box') {
      const slot = boxSlots[Math.min(boxIndex, boxSlots.length - 1)]
      boxIndex += 1
      return {
        ...op,
        x: slot.x,
        y: slot.y,
        w: 210,
        h: 92,
      }
    }
    if (op.type === 'section') {
      const slot = sectionSlots[Math.min(sectionIndex, sectionSlots.length - 1)]
      sectionIndex += 1
      return {
        ...op,
        x: slot.x,
        y: slot.y,
        w: 560,
      }
    }
    return op
  })
}

function opToSkeletons(ops: WhiteboardOp[]) {
  const skeletons: unknown[] = []
  const boxes = new Map<string, BoxRect>()
  const laidOutOps = layoutWhiteboardOps(ops)

  const ensureBox = (op: Extract<WhiteboardOp, { type: 'box' }>, index: number) => {
    const id = op.id || `wb-box-${index}`
    const w = Math.max(80, op.w || 190)
    const h = Math.max(56, op.h || 86)
    boxes.set(id, { id, x: op.x, y: op.y, w, h })
    skeletons.push({
      type: 'rectangle',
      id,
      x: op.x,
      y: op.y,
      width: w,
      height: h,
      strokeColor: op.color || '#334155',
      backgroundColor: op.bg || 'transparent',
      fillStyle: op.bg ? 'solid' : 'hachure',
      roundness: { type: 3 },
      strokeWidth: 2,
    })
    skeletons.push({
      type: 'text',
      id: `${id}-label`,
      x: op.x + 14,
      y: op.y + 18,
      width: w - 28,
      text: safeText(op.text),
      fontSize: 20,
      strokeColor: '#0f172a',
    })
  }

  laidOutOps.forEach((op, index) => {
    if (op.type === 'clear') return
    if (op.type === 'title') {
      skeletons.push({ type: 'text', x: op.x ?? 70, y: op.y ?? 45, text: safeText(op.text), fontSize: 34, strokeColor: '#0f172a' })
      return
    }
    if (op.type === 'text') {
      skeletons.push({ type: 'text', x: op.x, y: op.y, text: safeText(op.text), fontSize: fontSize(op.size), strokeColor: op.color || '#334155', width: 760 })
      return
    }
    if (op.type === 'box') {
      ensureBox(op, index)
      return
    }
    if (op.type === 'section') {
      const id = op.id || `wb-section-${index}`
      const w = Math.max(260, op.w || 500)
      const items = (op.items || []).slice(0, 4)
      const body = [op.title, '', ...items.map((item) => `• ${item}`)].join('\n')
      const h = Math.max(150, 78 + items.length * 34)
      boxes.set(id, { id, x: op.x, y: op.y, w, h })
      skeletons.push({
        type: 'rectangle',
        id,
        x: op.x,
        y: op.y,
        width: w,
        height: h,
        strokeColor: op.color || '#64748b',
        backgroundColor: '#ffffff',
        fillStyle: 'solid',
        roundness: { type: 3 },
        strokeWidth: 2,
      })
      skeletons.push({
        type: 'text',
        id: `${id}-text`,
        x: op.x + 18,
        y: op.y + 16,
        width: w - 36,
        text: safeText(body),
        fontSize: 20,
        strokeColor: '#0f172a',
      })
    }
  })

  laidOutOps.forEach((op, index) => {
    if (op.type !== 'arrow') return
    const from = op.from ? boxes.get(op.from) : null
    const to = op.to ? boxes.get(op.to) : null
    if (from && to) {
      const leftToRight = to.x >= from.x
      const startX = leftToRight ? from.x + from.w : from.x
      const startY = from.y + from.h / 2
      const endX = leftToRight ? to.x : to.x + to.w
      const endY = to.y + to.h / 2
      skeletons.push({
        type: 'arrow',
        id: makeArrowId(index),
        x: startX,
        y: startY,
        points: [[0, 0], [endX - startX, endY - startY]],
        strokeColor: op.color || '#475569',
        strokeWidth: 2,
        endArrowhead: 'arrow',
        label: op.label ? { text: safeText(op.label, ''), fontSize: 16 } : undefined,
      })
      return
    }
    if (typeof op.x1 === 'number' && typeof op.y1 === 'number' && typeof op.x2 === 'number' && typeof op.y2 === 'number') {
      skeletons.push({
        type: 'arrow',
        id: makeArrowId(index),
        x: op.x1,
        y: op.y1,
        points: [[0, 0], [op.x2 - op.x1, op.y2 - op.y1]],
        strokeColor: op.color || '#475569',
        strokeWidth: 2,
        endArrowhead: 'arrow',
        label: op.label ? { text: safeText(op.label, ''), fontSize: 16 } : undefined,
      })
    }
  })

  return skeletons
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AgentWhiteboard({ challengeId, locale, ops, renderMode = 'full', busy, onExplain, onStep }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const timerRef = useRef<number[]>([])
  const [status, setStatus] = useState(locale === 'zh' ? '白板已就绪' : 'Whiteboard ready')
  const storageKey = useMemo(() => `arena:whiteboard:${challengeId}`, [challengeId])

  function clearStepTimers() {
    timerRef.current.forEach((timer) => window.clearTimeout(timer))
    timerRef.current = []
  }

  useEffect(() => {
    setStatus(locale === 'zh' ? '白板已就绪' : 'Whiteboard ready')
  }, [locale])

  useEffect(() => {
    if (!ops?.length || !apiRef.current) return
    let cancelled = false
    clearStepTimers()

    void import('@excalidraw/excalidraw').then(({ convertToExcalidrawElements }) => {
      if (cancelled || !apiRef.current) return
      const shouldClear = ops.some((op) => op.type === 'clear')
      const drawable = ops.filter((op) => op.type !== 'clear')
      const baseElements = shouldClear ? [] : apiRef.current.getSceneElements()

      const renderDrawable = (visibleOps: WhiteboardOp[], label?: string) => {
        if (cancelled || !apiRef.current) return
        const skeletons = opToSkeletons(visibleOps) as Parameters<typeof convertToExcalidrawElements>[0]
        const nextElements = convertToExcalidrawElements(skeletons, { regenerateIds: false })
        apiRef.current.updateScene({
          elements: [...baseElements, ...nextElements],
          appState: defaultAppState,
        })
        if (label) setStatus(label)
        window.setTimeout(() => apiRef.current?.scrollToContent?.(apiRef.current.getSceneElements(), { fitToContent: true }), 80)
      }

      const shouldStep = renderMode === 'step' || drawable.length > 4
      if (!shouldStep || drawable.length <= 2) {
        renderDrawable(drawable, locale === 'zh' ? `已绘制 ${drawable.length} 个白板步骤` : `Rendered ${drawable.length} whiteboard steps`)
        return
      }

      renderDrawable([], locale === 'zh' ? '开始逐步推导…' : 'Starting step derivation…')
      drawable.forEach((_, index) => {
        const timer = window.setTimeout(() => {
          const count = index + 1
          renderDrawable(
            drawable.slice(0, count),
            locale === 'zh' ? `逐步推导 ${count}/${drawable.length}` : `Step derivation ${count}/${drawable.length}`,
          )
        }, 240 + index * 720)
        timerRef.current.push(timer)
      })
    })

    return () => {
      cancelled = true
      clearStepTimers()
    }
  }, [ops, locale, renderMode])

  useEffect(() => () => clearStepTimers(), [])

  function clearBoard() {
    clearStepTimers()
    apiRef.current?.updateScene({ elements: [], appState: defaultAppState })
    window.localStorage.removeItem(storageKey)
    setStatus(locale === 'zh' ? '白板已清空' : 'Whiteboard cleared')
  }

  function exportBoard() {
    if (!apiRef.current) return
    downloadJson(`arena-whiteboard-${challengeId}.excalidraw.json`, {
      type: 'excalidraw',
      version: 2,
      source: 'wtt-arena-agent-whiteboard',
      elements: apiRef.current.getSceneElements(),
      appState: apiRef.current.getAppState(),
      files: apiRef.current.getFiles(),
    })
  }

  const labels = locale === 'zh'
    ? { title: 'Agent 白板讲解', subtitle: 'Agent 会把面试答案推导成结构化白板：公式、架构、指标、trade-off。', explain: 'Agent 讲解', step: '逐步推导', clear: '清空', export: '导出 JSON' }
    : { title: 'Agent whiteboard', subtitle: 'The Agent turns an interview answer into a structured board: formulas, architecture, metrics, and trade-offs.', explain: 'Agent explain', step: 'Step derivation', clear: 'Clear', export: 'Export JSON' }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-[#191919] px-4 py-3">
        <div>
          <p className="text-sm font-black text-white">{labels.title}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onExplain} disabled={busy} className="rounded-md bg-gradient-to-r from-violet-300 to-fuchsia-500 px-3 py-2 text-xs font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? '...' : labels.explain}</button>
          <button onClick={onStep} disabled={busy} className="rounded-md border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-200 hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-40">{labels.step}</button>
          <button onClick={clearBoard} className="rounded-md border border-gray-700 bg-[#101010] px-3 py-2 text-xs font-bold text-gray-300 hover:border-gray-500">{labels.clear}</button>
          <button onClick={exportBoard} className="rounded-md border border-[#3ce8e2]/30 bg-[#3ce8e2]/10 px-3 py-2 text-xs font-bold text-[#bffffd] hover:border-[#3ce8e2]">{labels.export}</button>
        </div>
      </div>
      <div className="relative min-h-[560px] flex-1 bg-slate-50">
        <Excalidraw
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => { apiRef.current = api }}
          initialData={async () => {
            if (typeof window === 'undefined') return { appState: defaultAppState }
            try {
              const raw = window.localStorage.getItem(storageKey)
              if (!raw) return { appState: defaultAppState }
              const scene = JSON.parse(raw)
              return { elements: scene.elements || [], appState: { ...defaultAppState, ...(scene.appState || {}) }, files: scene.files || {} }
            } catch {
              return { appState: defaultAppState }
            }
          }}
          onChange={(elements, appState, files) => {
            try {
              window.localStorage.setItem(storageKey, JSON.stringify({ elements, appState: { viewBackgroundColor: appState.viewBackgroundColor }, files }))
            } catch {
              // localStorage can be unavailable in private mode; whiteboard still works in memory.
            }
          }}
          theme="light"
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
        />
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">{status}</div>
      </div>
    </section>
  )
}
