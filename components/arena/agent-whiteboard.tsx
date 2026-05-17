'use client'

import { useEffect, useMemo, useState } from 'react'
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

type BoardViewMode = 'diagram' | 'html'
type WhiteboardPlayerStep = { index: number; stage: string; title: string; summary: string[]; markdown: string; rawMarkdown: string; mermaid: string; html: string }
type WhiteboardPlayerPayload = { locale: Locale; title: string; summary: string[]; html: string; mermaid: string; steps: WhiteboardPlayerStep[] }

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

function MermaidPreview({ chart, label, compact = false }: { chart: string; label?: string; compact?: boolean }) {
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={`mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${compact ? 'p-3' : 'p-5'}`}
    >
      {label ? <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</p> : null}
      <div
        className={`flex justify-center overflow-auto [&_svg]:max-w-full [&_svg_text]:font-semibold ${compact ? '[&_svg]:max-h-[360px]' : '[&_svg]:max-h-[620px]'}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </motion.div>
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
          {locale === 'zh' ? '阶段顺序' : 'Stage order'}
        </p>
        <p className="text-xs font-semibold text-slate-400">
          {locale === 'zh' ? '总图保持稳定，下面按阶段解释' : 'The overview stays stable; details follow by stage'}
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

function mermaidLabel(value: string, fallback: string) {
  const label = (value || fallback)
    .replace(/["`[\]{}<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 42)
  return label || fallback
}

function buildFallbackFinalChart(steps: WhiteboardDiagramStep[], locale: Locale) {
  const visibleSteps = steps.slice(0, 6)
  if (!visibleSteps.length) return ''
  const nodes = visibleSteps.map((step, index) => {
    const label = mermaidLabel(step.stage || step.title || '', `${locale === 'zh' ? '阶段' : 'Step'} ${index + 1}`)
    return `  S${index + 1}["${index + 1}. ${label}"]`
  })
  const edges = visibleSteps.slice(1).map((_, index) => `  S${index + 1} --> S${index + 2}`)
  const middleNodes = visibleSteps.slice(1, -1).map((_, index) => `S${index + 2}`)
  const classLines = [
    '  class S1 input;',
    middleNodes.length ? `  class ${middleNodes.join(',')} core;` : '',
    visibleSteps.length > 1 ? `  class S${visibleSteps.length} metric;` : '',
  ]
  return [
    'flowchart LR',
    ...nodes,
    ...edges,
    '  classDef input fill:#dbeafe,stroke:#2563eb,color:#0f172a;',
    '  classDef core fill:#ede9fe,stroke:#7c3aed,color:#2e1065;',
    '  classDef metric fill:#dcfce7,stroke:#16a34a,color:#052e16;',
    ...classLines,
  ].filter(Boolean).join('\n')
}

function finalChartForDiagram(diagram: WhiteboardDiagram, steps: WhiteboardDiagramStep[], locale: Locale) {
  const firstLocalChart = steps.find((step) => step.mermaid?.trim())?.mermaid || ''
  return (diagram.mermaid || diagram.source || firstLocalChart || buildFallbackFinalChart(steps, locale)).trim()
}

function localDiagramLabel(step: WhiteboardDiagramStep, locale: Locale) {
  const text = `${step.stage || ''} ${step.title || ''}`.toLowerCase()
  if (/(arch|concept|架构|概念)/.test(text)) return locale === 'zh' ? '局部架构图' : 'Local architecture'
  if (/(flow|pipeline|process|decomposition|拆解|流程|过程)/.test(text)) return locale === 'zh' ? '局部流程图' : 'Local flow'
  return locale === 'zh' ? '局部图' : 'Local diagram'
}

function FinalDiagramPanel({ chart, locale }: { chart: string; locale: Locale }) {
  return (
    <motion.section variants={cardVariants} className="rounded-xl border border-slate-200 bg-white/92 p-3 shadow-sm">
      <MermaidPreview chart={chart} label={locale === 'zh' ? '图解' : 'Diagram'} compact />
    </motion.section>
  )
}

function htmlForDiagram(diagram: WhiteboardDiagram) {
  if (diagram.html?.trim()) return diagram.html.trim()
  const stepHtml = (diagram.steps || [])
    .map((step, index) => step.html?.trim()
      ? `<section class="whiteboard-html-step" data-step="${index + 1}">${step.html.trim()}</section>`
      : '')
    .filter(Boolean)
  return stepHtml.join('\n')
}

function compactMarkdown(markdown: string, max = 420) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/[#*_>`~\-[\]]/g, ' ')
    .replace(/\$\$?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function playerPayloadForDiagram(diagram: WhiteboardDiagram, locale: Locale): WhiteboardPlayerPayload {
  const steps = diagram.steps?.length
    ? diagram.steps
    : [{ title: diagram.title || (locale === 'zh' ? '白板图' : 'Whiteboard diagram'), markdown: diagram.markdown, mermaid: diagram.mermaid || diagram.source, summary: diagram.summary }]
  return {
    locale,
    title: diagram.title || (locale === 'zh' ? '原理动画白板' : 'Animated principle board'),
    summary: diagram.summary || [],
    html: htmlForDiagram(diagram),
    mermaid: diagram.mermaid || diagram.source || '',
    steps: steps.slice(0, 6).map((step, index) => ({
      index: index + 1,
      stage: step.stage || '',
      title: step.title || step.stage || `${locale === 'zh' ? '步骤' : 'Step'} ${index + 1}`,
      summary: step.summary || [],
      markdown: compactMarkdown(step.markdown || ''),
      rawMarkdown: step.markdown || '',
      mermaid: step.mermaid || step.source || '',
      html: step.html || '',
    })),
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char))
}

function sanitizeEmbeddedHtml(html: string) {
  return String(html || '')
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(/<\/?(html|head|body|meta)[^>]*>/gi, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

function missingHtmlBody(payload: WhiteboardPlayerPayload) {
  const zh = payload.locale === 'zh'
  return `
    <div class="shell missing-html">
      <p class="kicker">${zh ? 'HTML 动画未生成' : 'HTML animation missing'}</p>
      <h1>${escapeHtml(payload.title)}</h1>
      <p>${zh
        ? '本轮 Agent 没有返回 html 字段。HTML 视图不会用前端模板代替，因为这里应该展示 Agent 基于回答仔细分析后绘制的公式、原理、流程图、架构图和表格。请重新点击“生成白板”，或继续追问要求 Agent 输出 WHITEBOARD_DIAGRAM.html。'
        : 'The Agent did not return an html field for this response. The HTML view does not replace it with a frontend template, because this view should show formulas, principles, flow diagrams, architecture diagrams, and tables produced by the Agent from its answer. Regenerate the board or ask the Agent to output WHITEBOARD_DIAGRAM.html.'}</p>
    </div>
  `
}

function buildWhiteboardHtmlDocument(payload: WhiteboardPlayerPayload) {
  const body = payload.html ? `<div class="shell custom-html">${sanitizeEmbeddedHtml(payload.html)}</div>` : missingHtmlBody(payload)
  return `<!doctype html>
<html lang="${payload.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';">
  <title>${escapeHtml(payload.title)}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f8fafc;color:#0f172a;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{overflow:auto}.root{min-height:100vh;padding:24px;background:radial-gradient(circle at 18% 12%,rgba(6,182,212,.18),transparent 26%),radial-gradient(circle at 84% 18%,rgba(124,58,237,.16),transparent 30%),linear-gradient(135deg,#f8fafc 0%,#eef6ff 52%,#fff7ed 100%)}.shell{max-width:1180px;margin:0 auto}.custom-html>*{max-width:100%}.missing-html{margin-top:16px;border:1px solid #fed7aa;border-radius:24px;background:#fff7ed;padding:24px;box-shadow:0 20px 60px rgba(124,45,18,.12)}.kicker{margin:0 0 12px;color:#c2410c;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}h1{margin:0 0 12px;font-size:clamp(24px,4vw,40px);line-height:1.08;letter-spacing:-.04em}.missing-html p{color:#7c2d12;font-size:15px;line-height:1.8}
  </style>
</head>
<body><main class="root">${body}</main></body>
</html>`
}

function HtmlAnimationBoard({ diagram, locale }: { diagram: WhiteboardDiagram; locale: Locale }) {
  const payload = useMemo(() => playerPayloadForDiagram(diagram, locale), [diagram, locale])
  const iframeSrc = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const html = buildWhiteboardHtmlDocument(payload)
    return URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  }, [payload])

  useEffect(() => () => {
    if (iframeSrc) URL.revokeObjectURL(iframeSrc)
  }, [iframeSrc])

  return (
    <motion.section variants={cardVariants} className="overflow-hidden rounded-xl border border-cyan-200 bg-slate-950 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">
          {locale === 'zh' ? 'HTML 动画白板' : 'HTML animation board'}
        </p>
        <p className="text-xs font-semibold text-cyan-200/70">
          {locale === 'zh' ? 'Sandbox 渲染 · CSS/SVG 动画' : 'Sandboxed render · CSS/SVG animation'}
        </p>
      </div>
      <iframe
        title={locale === 'zh' ? '白板 HTML 动画' : 'Whiteboard HTML animation'}
        src={iframeSrc}
        sandbox=""
        referrerPolicy="no-referrer"
        className="h-[680px] w-full rounded-lg border border-white/10 bg-slate-50"
      />
    </motion.section>
  )
}

function DirectDiagramBoard({ diagram, locale, viewMode }: { diagram: WhiteboardDiagram; locale: Locale; viewMode: BoardViewMode }) {
  const steps = diagram.steps?.length
    ? diagram.steps
    : [{ title: diagram.title || (locale === 'zh' ? '白板图' : 'Whiteboard diagram'), markdown: diagram.markdown, mermaid: diagram.mermaid || diagram.source, summary: diagram.summary }]
  const finalChart = finalChartForDiagram(diagram, steps, locale)
  const resolvedMode = viewMode

  return (
    <div className={`h-full min-h-[640px] overflow-auto text-slate-900 ${resolvedMode === 'html' ? 'bg-slate-950 p-3' : 'bg-[linear-gradient(135deg,#f8fafc_0%,#eef6ff_48%,#f8fafc_100%)] p-6'}`}>
      <motion.div
        className={resolvedMode === 'html' ? 'h-full' : 'mx-auto max-w-7xl space-y-5'}
        variants={boardVariants}
        initial="hidden"
        animate="show"
      >
        {resolvedMode === 'html' ? (
          <HtmlAnimationBoard diagram={diagram} locale={locale} />
        ) : (
          <>
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
            {finalChart ? <FinalDiagramPanel chart={finalChart} locale={locale} /> : null}
            <ProcessRail steps={steps} locale={locale} />
            {steps.map((step, index) => {
              const style = stepStyles[index % stepStyles.length]
              const localChart = step.mermaid?.trim() || ''
              const showLocalChart = Boolean(localChart && localChart !== finalChart)
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
                {showLocalChart ? <MermaidPreview chart={localChart} label={localDiagramLabel(step, locale)} compact /> : null}
                {step.summary?.length ? (
                  <motion.ul variants={cardVariants} className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {step.summary.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                  </motion.ul>
                ) : null}
              </motion.section>
              )
            })}
          </>
        )}
      </motion.div>
    </div>
  )
}

export function AgentWhiteboard({ challengeId, locale, diagram, expanded, busy, onExplain, onToggleExpand }: Props) {
  const [status, setStatus] = useState(locale === 'zh' ? '白板已就绪' : 'Whiteboard ready')
  const [boardCleared, setBoardCleared] = useState(false)
  const activeDiagram = boardCleared ? null : diagram
  const [viewMode, setViewMode] = useState<BoardViewMode>('diagram')

  useEffect(() => {
    setBoardCleared(false)
  }, [challengeId, diagram])

  useEffect(() => {
    setViewMode('diagram')
  }, [challengeId, diagram])

  useEffect(() => {
    setStatus(locale === 'zh' ? '白板已就绪' : 'Whiteboard ready')
  }, [locale])

  function clearBoard() {
    setBoardCleared(true)
    setStatus(locale === 'zh' ? '白板已清空' : 'Whiteboard cleared')
  }

  const labels = locale === 'zh'
    ? { title: 'Agent 白板讲解', subtitle: 'Markdown / 公式 / Mermaid / HTML 动画', explain: '生成白板', clear: '清空', expand: expanded ? '还原' : '展开' }
    : { title: 'Agent whiteboard', subtitle: 'Markdown / formulas / Mermaid / HTML animation', explain: 'Generate board', clear: 'Clear', expand: expanded ? 'Restore' : 'Expand' }

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] ${expanded ? 'h-full' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-[#191919] px-4 py-3">
        <div>
          <p className="text-sm font-black text-white">{labels.title}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 inline-flex rounded-md border border-gray-700 bg-[#101010] p-1">
            <button
              type="button"
              onClick={() => setViewMode('html')}
              className={`rounded px-2.5 py-1.5 text-xs font-black transition-colors ${viewMode === 'html' ? 'bg-[#3ce8e2] text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              HTML
            </button>
            <button
              type="button"
              onClick={() => setViewMode('diagram')}
              className={`rounded px-2.5 py-1.5 text-xs font-black transition-colors ${viewMode === 'diagram' ? 'bg-white text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              Markdown
            </button>
          </div>
          <button onClick={onExplain} disabled={busy} className="rounded-md bg-gradient-to-r from-violet-300 to-fuchsia-500 px-3 py-2 text-xs font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? '...' : labels.explain}</button>
          {onToggleExpand ? <button onClick={onToggleExpand} className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100 hover:border-amber-200">{labels.expand}</button> : null}
          <button onClick={clearBoard} className="rounded-md border border-gray-700 bg-[#101010] px-3 py-2 text-xs font-bold text-gray-300 hover:border-gray-500">{labels.clear}</button>
        </div>
      </div>
      <div className="relative min-h-[560px] flex-1 bg-slate-50">
        <AnimatePresence mode="wait">
          {activeDiagram ? (
            <motion.div key={`diagram-${viewMode}`} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              <DirectDiagramBoard diagram={activeDiagram} locale={locale} viewMode={viewMode} />
            </motion.div>
          ) : viewMode === 'html' ? (
            <motion.div key="html-empty" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              <HtmlAnimationBoard
                locale={locale}
                diagram={{
                  title: locale === 'zh' ? '本地 HTML 动画白板' : 'Local HTML animation board',
                  summary: [locale === 'zh' ? 'wtt-web 已加载本地 HTML player，生成白板后会把 Agent 内容传入这里渲染。' : 'wtt-web has loaded the local HTML player. Generated whiteboard content will render here.'],
                  steps: [
                    { title: locale === 'zh' ? '等待输入' : 'Waiting for input', markdown: locale === 'zh' ? '点击生成白板后，本地 HTML 文件会加载 diagram/steps 并生成动画。' : 'Click generate board; the local HTML file will load diagram/steps and generate animation.' },
                    { title: locale === 'zh' ? 'HTML 渲染' : 'HTML rendering', markdown: locale === 'zh' ? 'HTML 模式由 /arena-whiteboard-player.html 提供，不依赖 Agent 一定输出 html 字段。' : 'HTML mode is provided by /arena-whiteboard-player.html and does not require the Agent to output an html field.' },
                  ],
                }}
              />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex h-full min-h-[560px] items-center justify-center p-8 text-center">
              <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-base font-black text-slate-800">{locale === 'zh' ? '等待 Agent 生成白板' : 'Waiting for Agent whiteboard'}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {locale === 'zh'
                    ? '白板现在同时支持图文白板和 sandbox HTML 动画，用于展示公式推导、变量流和原理过程。'
                    : 'The board now supports both diagram boards and sandboxed HTML animation for formula derivations, variable flow, and principle processes.'}
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
