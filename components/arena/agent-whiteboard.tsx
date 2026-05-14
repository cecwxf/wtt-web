'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { ExcalidrawWhiteboardElement, WhiteboardDiagram } from '@/lib/arena/whiteboard'

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
  diagram?: WhiteboardDiagram | null
  renderMode?: 'full' | 'step'
  expanded?: boolean
  busy?: boolean
  onExplain?: () => void
  onStep?: () => void
  onToggleExpand?: () => void
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

function MermaidPreview({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const id = `arena-mermaid-${Math.random().toString(36).slice(2, 10)}`
    setSvg('')
    setError('')
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'loose',
        flowchart: { curve: 'basis', padding: 18 },
        themeVariables: {
          primaryColor: '#dbeafe',
          primaryBorderColor: '#2563eb',
          primaryTextColor: '#0f172a',
          secondaryColor: '#ccfbf1',
          tertiaryColor: '#fef3c7',
          lineColor: '#64748b',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          fontSize: '18px',
        },
      })
      return mermaid.render(id, chart.trim())
    }).then(({ svg: nextSvg }) => {
      if (!cancelled) setSvg(nextSvg)
    }).catch((errorValue) => {
      if (!cancelled) setError(String(errorValue))
    })
    return () => { cancelled = true }
  }, [chart])

  if (error) return <pre className="max-h-[360px] overflow-auto rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{chart}</pre>
  if (!svg) return <div className="flex min-h-[240px] items-center justify-center text-base font-semibold text-slate-400">Rendering diagram...</div>
  return <div className="mt-4 flex justify-center overflow-auto rounded-lg border border-slate-200 bg-white p-5 [&_svg]:max-h-[560px] [&_svg]:max-w-full [&_svg_text]:font-semibold" dangerouslySetInnerHTML={{ __html: svg }} />
}

const stepStyles = [
  {
    shell: 'border-cyan-200 bg-cyan-50/40',
    badge: 'bg-cyan-600',
    stage: 'text-cyan-700',
    title: 'text-cyan-950',
    markdown: '[&_th]:bg-cyan-100 [&_th]:text-cyan-950 [&_td]:bg-white',
  },
  {
    shell: 'border-violet-200 bg-violet-50/40',
    badge: 'bg-violet-600',
    stage: 'text-violet-700',
    title: 'text-violet-950',
    markdown: '[&_th]:bg-violet-100 [&_th]:text-violet-950 [&_td]:bg-white',
  },
  {
    shell: 'border-amber-200 bg-amber-50/50',
    badge: 'bg-amber-600',
    stage: 'text-amber-700',
    title: 'text-amber-950',
    markdown: '[&_th]:bg-amber-100 [&_th]:text-amber-950 [&_td]:bg-white',
  },
  {
    shell: 'border-emerald-200 bg-emerald-50/45',
    badge: 'bg-emerald-600',
    stage: 'text-emerald-700',
    title: 'text-emerald-950',
    markdown: '[&_th]:bg-emerald-100 [&_th]:text-emerald-950 [&_td]:bg-white',
  },
]

function DirectDiagramBoard({ diagram, locale }: { diagram: WhiteboardDiagram; locale: Locale }) {
  const steps = diagram.steps?.length
    ? diagram.steps
    : [{ title: diagram.title || (locale === 'zh' ? '白板图' : 'Whiteboard diagram'), markdown: diagram.markdown, mermaid: diagram.mermaid || diagram.source, summary: diagram.summary }]
  return (
    <div className="h-full min-h-[640px] overflow-auto bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        {diagram.title ? <h3 className="text-3xl font-black tracking-tight text-slate-950">{diagram.title}</h3> : null}
        {diagram.summary?.length ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-base leading-7 text-slate-600 shadow-sm">
            {diagram.summary.map((item, index) => <p key={index}>{item}</p>)}
          </div>
        ) : null}
        {steps.map((step, index) => {
          const style = stepStyles[index % stepStyles.length]
          return (
          <section key={`${step.stage || 'step'}-${index}`} className={`rounded-xl border p-5 shadow-sm ${style.shell}`}>
            <div className="mb-4 flex items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white shadow-sm ${style.badge}`}>{index + 1}</span>
              <div>
                <p className={`text-lg font-black ${style.title}`}>{step.title || step.stage || `Step ${index + 1}`}</p>
                {step.stage ? <p className={`text-sm font-semibold uppercase tracking-wide ${style.stage}`}>{step.stage}</p> : null}
              </div>
            </div>
            {step.markdown ? (
              <div className={`max-w-none overflow-auto rounded-lg bg-white/70 p-4 text-base leading-8 text-slate-800 [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_li]:ml-6 [&_li]:list-disc [&_p]:my-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-base [&_td]:border [&_td]:border-slate-200 [&_td]:p-3 [&_th]:border [&_th]:border-slate-200 [&_th]:p-3 [&_th]:text-left ${style.markdown}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{step.markdown}</ReactMarkdown>
              </div>
            ) : null}
            {step.mermaid ? <MermaidPreview chart={step.mermaid} /> : null}
            {step.summary?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {step.summary.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
              </ul>
            ) : null}
          </section>
          )
        })}
      </div>
    </div>
  )
}

export function AgentWhiteboard({ challengeId, locale, elements, diagram, renderMode = 'full', expanded, busy, onExplain, onStep, onToggleExpand }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const timerRef = useRef<number[]>([])
  const [status, setStatus] = useState(locale === 'zh' ? '白板已就绪' : 'Whiteboard ready')
  const [boardCleared, setBoardCleared] = useState(false)
  const storageKey = useMemo(() => `arena:whiteboard:${challengeId}`, [challengeId])
  const activeElements = useMemo(() => (boardCleared ? [] : elements), [boardCleared, elements])
  const activeDiagram = boardCleared ? null : diagram

  function clearStepTimers() {
    timerRef.current.forEach((timer) => window.clearTimeout(timer))
    timerRef.current = []
  }

  useEffect(() => {
    setBoardCleared(false)
  }, [challengeId, elements, diagram])

  useEffect(() => {
    setStatus(locale === 'zh' ? '白板已就绪' : 'Whiteboard ready')
  }, [locale])

  useEffect(() => {
    if (activeDiagram || !activeElements?.length || !apiRef.current) return
    let cancelled = false
    clearStepTimers()

    void import('@excalidraw/excalidraw').then(({ convertToExcalidrawElements }) => {
      if (cancelled || !apiRef.current) return
      const drawable = activeElements
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
  }, [activeDiagram, activeElements, locale, renderMode])

  useEffect(() => () => clearStepTimers(), [])

  function clearBoard() {
    clearStepTimers()
    setBoardCleared(true)
    apiRef.current?.updateScene({ elements: [], appState: defaultAppState })
    window.localStorage.removeItem(storageKey)
    setStatus(locale === 'zh' ? '白板已清空' : 'Whiteboard cleared')
  }

  function exportBoard() {
    if (activeDiagram) {
      downloadJson(`arena-whiteboard-${challengeId}.diagram.json`, activeDiagram)
      return
    }
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
    ? { title: 'Agent 白板讲解', subtitle: 'Agent 会把面试答案推导成结构化白板：公式、架构、指标、trade-off。', explain: 'Agent 讲解', step: '逐步推导', clear: '清空', export: '导出 JSON', expand: expanded ? '还原' : '展开' }
    : { title: 'Agent whiteboard', subtitle: 'The Agent turns an interview answer into a structured board: formulas, architecture, metrics, and trade-offs.', explain: 'Agent explain', step: 'Step derivation', clear: 'Clear', export: 'Export JSON', expand: expanded ? 'Restore' : 'Expand' }

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] ${expanded ? 'h-full' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-[#191919] px-4 py-3">
        <div>
          <p className="text-sm font-black text-white">{labels.title}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onExplain} disabled={busy} className="rounded-md bg-gradient-to-r from-violet-300 to-fuchsia-500 px-3 py-2 text-xs font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? '...' : labels.explain}</button>
          <button onClick={onStep} disabled={busy} className="rounded-md border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-200 hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-40">{labels.step}</button>
          {onToggleExpand ? <button onClick={onToggleExpand} className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100 hover:border-amber-200">{labels.expand}</button> : null}
          <button onClick={clearBoard} className="rounded-md border border-gray-700 bg-[#101010] px-3 py-2 text-xs font-bold text-gray-300 hover:border-gray-500">{labels.clear}</button>
          <button onClick={exportBoard} className="rounded-md border border-[#3ce8e2]/30 bg-[#3ce8e2]/10 px-3 py-2 text-xs font-bold text-[#bffffd] hover:border-[#3ce8e2]">{labels.export}</button>
        </div>
      </div>
      <div className="relative min-h-[560px] flex-1 bg-slate-50">
        {activeDiagram ? (
          <DirectDiagramBoard diagram={activeDiagram} locale={locale} />
        ) : (
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
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">{status}</div>
      </div>
    </section>
  )
}
