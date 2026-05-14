'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { WhiteboardDiagram } from '@/lib/arena/whiteboard'
import { normalizeMarkdownMath } from '@/lib/markdown-math'

type Locale = 'zh' | 'en'

type Props = {
  challengeId: string
  locale: Locale
  diagram?: WhiteboardDiagram | null
  expanded?: boolean
  busy?: boolean
  onExplain?: () => void
  onToggleExpand?: () => void
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
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMarkdownMath(step.markdown)}</ReactMarkdown>
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

export function AgentWhiteboard({ challengeId, locale, diagram, expanded, busy, onExplain, onToggleExpand }: Props) {
  const [status, setStatus] = useState(locale === 'zh' ? '白板已就绪' : 'Whiteboard ready')
  const [boardCleared, setBoardCleared] = useState(false)
  const activeDiagram = boardCleared ? null : diagram

  useEffect(() => {
    setBoardCleared(false)
  }, [challengeId, diagram])

  useEffect(() => {
    setStatus(locale === 'zh' ? '白板已就绪' : 'Whiteboard ready')
  }, [locale])

  function clearBoard() {
    setBoardCleared(true)
    setStatus(locale === 'zh' ? '白板已清空' : 'Whiteboard cleared')
  }

  const labels = locale === 'zh'
    ? { title: 'Agent 白板讲解', subtitle: 'Markdown / 公式 / Mermaid 图表', explain: '生成白板', clear: '清空', expand: expanded ? '还原' : '展开' }
    : { title: 'Agent whiteboard', subtitle: 'Markdown / formulas / Mermaid diagrams', explain: 'Generate board', clear: 'Clear', expand: expanded ? 'Restore' : 'Expand' }

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] ${expanded ? 'h-full' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-[#191919] px-4 py-3">
        <div>
          <p className="text-sm font-black text-white">{labels.title}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onExplain} disabled={busy} className="rounded-md bg-gradient-to-r from-violet-300 to-fuchsia-500 px-3 py-2 text-xs font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? '...' : labels.explain}</button>
          {onToggleExpand ? <button onClick={onToggleExpand} className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100 hover:border-amber-200">{labels.expand}</button> : null}
          <button onClick={clearBoard} className="rounded-md border border-gray-700 bg-[#101010] px-3 py-2 text-xs font-bold text-gray-300 hover:border-gray-500">{labels.clear}</button>
        </div>
      </div>
      <div className="relative min-h-[560px] flex-1 bg-slate-50">
        {activeDiagram ? (
          <DirectDiagramBoard diagram={activeDiagram} locale={locale} />
        ) : (
          <div className="flex h-full min-h-[560px] items-center justify-center p-8 text-center">
            <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-base font-black text-slate-800">{locale === 'zh' ? '等待 Agent 生成白板' : 'Waiting for Agent whiteboard'}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {locale === 'zh'
                  ? '白板现在只渲染 Markdown、公式和 Mermaid 图表，不再回退到旧的方框画板。'
                  : 'The board now renders Markdown, formulas, and Mermaid diagrams only, without the old box fallback.'}
              </p>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">{status}</div>
      </div>
    </section>
  )
}
