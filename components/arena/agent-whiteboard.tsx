'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { WhiteboardDiagram, WhiteboardDiagramStep } from '@/lib/arena/whiteboard'
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

const smoothEase = [0.22, 1, 0.36, 1] as const

const boardVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.08 },
  },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.42, ease: smoothEase },
  },
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mb-4 mt-2 text-2xl font-black tracking-tight text-slate-950">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-black tracking-tight text-slate-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-black text-slate-900">{children}</h3>,
  p: ({ children }) => <p className="my-3 text-base leading-8 text-slate-700">{children}</p>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-4 hover:text-cyan-900">{children}</a>,
  strong: ({ children }) => <strong className="font-black text-slate-950">{children}</strong>,
  em: ({ children }) => <em className="text-slate-600">{children}</em>,
  ul: ({ children }) => <ul className="my-3 space-y-2 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-5">{children}</ol>,
  li: ({ children }) => <li className="list-disc pl-1 text-base leading-7 text-slate-700 marker:text-slate-400">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-cyan-300 bg-cyan-50/70 px-4 py-2 text-slate-700">{children}</blockquote>,
  table: ({ children }) => <table className="my-4 w-full border-collapse text-sm">{children}</table>,
  thead: ({ children }) => <thead className="bg-slate-100 text-slate-950">{children}</thead>,
  th: ({ children }) => <th className="border border-slate-200 px-3 py-2 text-left align-top font-black">{children}</th>,
  td: ({ children }) => <td className="border border-slate-200 bg-white px-3 py-2 align-top leading-7 text-slate-700">{children}</td>,
  pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-sm leading-6 text-slate-100 shadow-inner">{children}</pre>,
  code: ({ children, className }) => {
    const isBlock = Boolean(className)
    if (isBlock) return <code className={className}>{children}</code>
    return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] font-semibold text-slate-900">{children}</code>
  },
}

function WhiteboardMarkdown({ markdown, tone }: { markdown: string; tone: string }) {
  return (
    <motion.div
      className={`relative max-w-none overflow-auto rounded-lg border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur-sm ${tone}`}
      variants={cardVariants}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalizeMarkdownMath(markdown)}
      </ReactMarkdown>
    </motion.div>
  )
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
  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.36, ease: 'easeOut' }}
        className="arena-mermaid-draw mt-4 flex justify-center overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-sm [&_svg]:max-h-[560px] [&_svg]:max-w-full [&_svg_text]:font-semibold"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <style jsx global>{`
        .arena-mermaid-draw svg .node,
        .arena-mermaid-draw svg .edgeLabel,
        .arena-mermaid-draw svg .cluster {
          opacity: 0;
          animation: arena-node-reveal 460ms ease-out forwards;
        }
        .arena-mermaid-draw svg .node:nth-of-type(1) { animation-delay: 80ms; }
        .arena-mermaid-draw svg .node:nth-of-type(2) { animation-delay: 160ms; }
        .arena-mermaid-draw svg .node:nth-of-type(3) { animation-delay: 240ms; }
        .arena-mermaid-draw svg .node:nth-of-type(4) { animation-delay: 320ms; }
        .arena-mermaid-draw svg .node:nth-of-type(5) { animation-delay: 400ms; }
        .arena-mermaid-draw svg .node:nth-of-type(6) { animation-delay: 480ms; }
        .arena-mermaid-draw svg .edgePaths path,
        .arena-mermaid-draw svg path.flowchart-link {
          stroke-dasharray: 720;
          stroke-dashoffset: 720;
          animation: arena-line-draw 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .arena-mermaid-draw svg .edgePaths path:nth-of-type(1) { animation-delay: 140ms; }
        .arena-mermaid-draw svg .edgePaths path:nth-of-type(2) { animation-delay: 240ms; }
        .arena-mermaid-draw svg .edgePaths path:nth-of-type(3) { animation-delay: 340ms; }
        .arena-mermaid-draw svg .edgePaths path:nth-of-type(4) { animation-delay: 440ms; }
        .arena-mermaid-draw svg .edgePaths path:nth-of-type(5) { animation-delay: 540ms; }
        .arena-mermaid-draw svg .edgePaths path:nth-of-type(6) { animation-delay: 640ms; }
        @keyframes arena-line-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes arena-node-reveal {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}

const stepStyles = [
  {
    shell: 'border-cyan-200 bg-cyan-50/40',
    badge: 'bg-cyan-600',
    stage: 'text-cyan-700',
    title: 'text-cyan-950',
    markdown: '[&_thead]:bg-cyan-100 [&_blockquote]:border-cyan-300 [&_blockquote]:bg-cyan-50',
    accent: 'from-cyan-400 via-sky-300 to-blue-500',
  },
  {
    shell: 'border-violet-200 bg-violet-50/40',
    badge: 'bg-violet-600',
    stage: 'text-violet-700',
    title: 'text-violet-950',
    markdown: '[&_thead]:bg-violet-100 [&_blockquote]:border-violet-300 [&_blockquote]:bg-violet-50',
    accent: 'from-violet-400 via-fuchsia-300 to-pink-500',
  },
  {
    shell: 'border-amber-200 bg-amber-50/50',
    badge: 'bg-amber-600',
    stage: 'text-amber-700',
    title: 'text-amber-950',
    markdown: '[&_thead]:bg-amber-100 [&_blockquote]:border-amber-300 [&_blockquote]:bg-amber-50',
    accent: 'from-amber-400 via-orange-300 to-rose-400',
  },
  {
    shell: 'border-emerald-200 bg-emerald-50/45',
    badge: 'bg-emerald-600',
    stage: 'text-emerald-700',
    title: 'text-emerald-950',
    markdown: '[&_thead]:bg-emerald-100 [&_blockquote]:border-emerald-300 [&_blockquote]:bg-emerald-50',
    accent: 'from-emerald-400 via-teal-300 to-cyan-500',
  },
]

function ProcessRail({ steps, locale }: { steps: WhiteboardDiagramStep[]; locale: Locale }) {
  const visibleSteps = steps.slice(0, 6)
  if (visibleSteps.length <= 1) return null
  return (
    <motion.div variants={cardVariants} className="overflow-hidden rounded-xl border border-slate-200 bg-white/88 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          {locale === 'zh' ? '过程动画' : 'Process animation'}
        </p>
        <p className="text-xs font-semibold text-slate-400">
          {locale === 'zh' ? '按阶段展开公式、架构图和解释' : 'Formulas, architecture, and explanation unfold by stage'}
        </p>
      </div>
      <div className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${visibleSteps.length}, minmax(0, 1fr))` }}>
        <motion.div
          className="absolute left-0 right-0 top-5 h-0.5 bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.95, ease: smoothEase }}
          style={{ transformOrigin: 'left' }}
        />
        {visibleSteps.map((step, index) => (
          <motion.div
            key={`${step.stage || step.title || 'stage'}-${index}`}
            className="relative min-w-0 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 * index + 0.12, duration: 0.36, ease: 'easeOut' }}
          >
            <span className="relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-sm font-black text-white shadow-sm">
              {index + 1}
            </span>
            <p className="mt-2 truncate text-xs font-black text-slate-800">{step.stage || step.title || `Step ${index + 1}`}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{step.title || step.stage || ''}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

function DirectDiagramBoard({ diagram, locale }: { diagram: WhiteboardDiagram; locale: Locale }) {
  const steps = diagram.steps?.length
    ? diagram.steps
    : [{ title: diagram.title || (locale === 'zh' ? '白板图' : 'Whiteboard diagram'), markdown: diagram.markdown, mermaid: diagram.mermaid || diagram.source, summary: diagram.summary }]
  return (
    <div className="h-full min-h-[640px] overflow-auto bg-[linear-gradient(135deg,#f8fafc_0%,#eef6ff_48%,#f8fafc_100%)] p-6 text-slate-900">
      <motion.div
        className="mx-auto max-w-7xl space-y-5"
        variants={boardVariants}
        initial="hidden"
        animate="show"
      >
        {diagram.title ? (
          <motion.h3 variants={cardVariants} className="text-3xl font-black tracking-tight text-slate-950">
            {diagram.title}
          </motion.h3>
        ) : null}
        {diagram.summary?.length ? (
          <motion.div variants={cardVariants} className="rounded-lg border border-slate-200 bg-white/90 p-4 text-base leading-7 text-slate-600 shadow-sm">
            {diagram.summary.map((item, index) => <p key={index}>{item}</p>)}
          </motion.div>
        ) : null}
        <ProcessRail steps={steps} locale={locale} />
        {steps.map((step, index) => {
          const style = stepStyles[index % stepStyles.length]
          return (
          <motion.section key={`${step.stage || 'step'}-${index}`} variants={cardVariants} className={`relative overflow-hidden rounded-xl border p-5 shadow-sm ${style.shell}`}>
            <motion.div
              className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.accent}`}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: index * 0.16 + 0.18, duration: 0.72, ease: smoothEase }}
              style={{ transformOrigin: 'left' }}
            />
            <div className="mb-4 flex items-center gap-3">
              <motion.span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white shadow-sm ${style.badge}`}
                initial={{ scale: 0.65, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: index * 0.12 + 0.12, duration: 0.32, ease: 'easeOut' }}
              >
                {index + 1}
              </motion.span>
              <div>
                <p className={`text-lg font-black ${style.title}`}>{step.title || step.stage || `Step ${index + 1}`}</p>
                {step.stage ? <p className={`text-sm font-semibold uppercase tracking-wide ${style.stage}`}>{step.stage}</p> : null}
              </div>
            </div>
            {step.markdown ? <WhiteboardMarkdown markdown={step.markdown} tone={style.markdown} /> : null}
            {step.mermaid ? <MermaidPreview chart={step.mermaid} /> : null}
            {step.summary?.length ? (
              <motion.ul variants={cardVariants} className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {step.summary.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
              </motion.ul>
            ) : null}
          </motion.section>
          )
        })}
      </motion.div>
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
        <AnimatePresence mode="wait">
          {activeDiagram ? (
            <motion.div key="diagram" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              <DirectDiagramBoard diagram={activeDiagram} locale={locale} />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex h-full min-h-[560px] items-center justify-center p-8 text-center">
              <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-base font-black text-slate-800">{locale === 'zh' ? '等待 Agent 生成白板' : 'Waiting for Agent whiteboard'}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {locale === 'zh'
                    ? '白板现在以分步动画渲染 Markdown、公式和 Mermaid 图表，不再回退到旧的方框画板。'
                    : 'The board now renders Markdown, formulas, and Mermaid diagrams with staged animation, without the old box fallback.'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">{status}</div>
      </div>
    </section>
  )
}
