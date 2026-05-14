'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExcalidrawWhiteboardElement } from '@/lib/arena/whiteboard'

const Excalidraw = dynamic(async () => (await import('@excalidraw/excalidraw')).Excalidraw, { ssr: false })

type Locale = 'zh' | 'en'
type ExcalidrawImperativeAPI = {
  getSceneElements: () => unknown[]
  getAppState: () => Record<string, unknown>
  getFiles: () => Record<string, unknown>
  updateScene: (scene: { elements?: unknown[]; appState?: Record<string, unknown> }) => void
  scrollToContent?: (elements: unknown[], options?: { fitToContent?: boolean }) => void
}

type Props = {
  challengeId: string
  locale: Locale
  elements?: ExcalidrawWhiteboardElement[]
  renderMode?: 'full' | 'step'
  busy?: boolean
  onExplain?: () => void
  onStep?: () => void
}

const defaultAppState = {
  viewBackgroundColor: '#f8fafc',
  currentItemStrokeColor: '#0f172a',
  currentItemBackgroundColor: 'transparent',
  currentItemFontFamily: 1,
  currentItemFontSize: 20,
}

function elementId(element: ExcalidrawWhiteboardElement) {
  return typeof element.id === 'string' ? element.id : ''
}

function elementType(element: ExcalidrawWhiteboardElement) {
  return typeof element.type === 'string' ? element.type : ''
}

function groupElementsForSteps(elements: ExcalidrawWhiteboardElement[]) {
  const entries: Array<[string, ExcalidrawWhiteboardElement]> = []
  elements.forEach((element) => {
    const id = elementId(element)
    if (id) entries.push([id, element])
  })
  const byId = new Map(entries)
  const consumed = new Set<string>()
  const chunks: ExcalidrawWhiteboardElement[][] = []
  const firstTexts = elements.filter((element) => ['title', 'subtitle'].includes(elementId(element)))
  if (firstTexts.length) {
    chunks.push(firstTexts)
    firstTexts.forEach((element) => consumed.add(elementId(element)))
  }

  elements.forEach((element) => {
    const id = elementId(element)
    if (!id || consumed.has(id)) return
    const type = elementType(element)
    if (type === 'rectangle' || type === 'ellipse' || type === 'diamond') {
      const group = [element]
      const label = byId.get(`${id}-label`) || byId.get(`${id}-text`)
      if (label) {
        group.push(label)
        consumed.add(elementId(label))
      }
      chunks.push(group)
      consumed.add(id)
    }
  })

  elements.forEach((element) => {
    const id = elementId(element)
    if (!id || consumed.has(id)) return
    chunks.push([element])
    consumed.add(id)
  })

  return chunks
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

export function AgentWhiteboard({ challengeId, locale, elements, renderMode = 'full', busy, onExplain, onStep }: Props) {
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
    if (!elements?.length || !apiRef.current) return
    let cancelled = false
    clearStepTimers()

    void import('@excalidraw/excalidraw').then(({ convertToExcalidrawElements }) => {
      if (cancelled || !apiRef.current) return
      const drawable = elements
      const chunks = groupElementsForSteps(drawable)
      apiRef.current.updateScene({ elements: [], appState: defaultAppState })

      const renderDrawable = (visibleElements: ExcalidrawWhiteboardElement[], label?: string) => {
        if (cancelled || !apiRef.current) return
        const skeletons = visibleElements as Parameters<typeof convertToExcalidrawElements>[0]
        const nextElements = convertToExcalidrawElements(skeletons, { regenerateIds: false })
        apiRef.current.updateScene({
          elements: nextElements,
          appState: defaultAppState,
        })
        if (label) setStatus(label)
        window.setTimeout(() => apiRef.current?.scrollToContent?.(apiRef.current.getSceneElements(), { fitToContent: true }), 80)
      }

      const shouldStep = renderMode === 'step' || chunks.length > 4
      if (!shouldStep || chunks.length <= 2) {
        renderDrawable(drawable, locale === 'zh' ? `已绘制 ${drawable.length} 个白板步骤` : `Rendered ${drawable.length} whiteboard steps`)
        return
      }

      renderDrawable([], locale === 'zh' ? '开始逐步推导…' : 'Starting step derivation…')
      chunks.forEach((_, index) => {
        const timer = window.setTimeout(() => {
          const count = index + 1
          renderDrawable(
            chunks.slice(0, count).flat(),
            locale === 'zh' ? `逐步推导 ${count}/${chunks.length}` : `Step derivation ${count}/${chunks.length}`,
          )
        }, 240 + index * 720)
        timerRef.current.push(timer)
      })
    })

    return () => {
      cancelled = true
      clearStepTimers()
    }
  }, [elements, locale, renderMode])

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
            return { elements: [], appState: defaultAppState }
          }}
          onChange={(elements: unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
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
