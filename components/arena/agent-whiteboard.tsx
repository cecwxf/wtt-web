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
type WhiteboardPlayerStep = { index: number; stage: string; title: string; summary: string[]; markdown: string; mermaid: string; html: string }
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

function formulaHint(step: WhiteboardPlayerStep | undefined, fallback: string) {
  const source = `${step?.markdown || ''} ${step?.title || ''}`
  const match = source.match(/\$\$?([^$]{4,160})\$\$?/)
  return (match?.[1] || source || fallback).replace(/\s+/g, ' ').trim().slice(0, 150) || fallback
}

function buildGeneratedAnimationHtml(payload: WhiteboardPlayerPayload) {
  const zh = payload.locale === 'zh'
  const steps = payload.steps.length ? payload.steps.slice(0, 6) : [
    { index: 1, stage: '', title: zh ? '定义变量' : 'Define variables', markdown: zh ? '明确已知量、目标和约束。' : 'Clarify known quantities, goals, and constraints.', mermaid: '', html: '', summary: [] },
    { index: 2, stage: '', title: zh ? '建立关系' : 'Build relation', markdown: zh ? '找到公式、不变量或机制主链路。' : 'Identify the formula, invariant, or main mechanism path.', mermaid: '', html: '', summary: [] },
    { index: 3, stage: '', title: zh ? '状态变换' : 'Transform state', markdown: zh ? '展示中间状态如何演化。' : 'Show how intermediate state evolves.', mermaid: '', html: '', summary: [] },
    { index: 4, stage: '', title: zh ? '边界检查' : 'Boundary check', markdown: zh ? '验证输出、指标和失败情况。' : 'Validate output, metric, and failure cases.', mermaid: '', html: '', summary: [] },
  ]
  const summary = payload.summary.length ? payload.summary : [zh ? '这份 HTML 由当前题目和白板步骤动态生成。' : 'This HTML was dynamically generated from the current challenge and whiteboard steps.']
  const first = steps[0]
  const mid = steps[Math.min(1, steps.length - 1)]
  const last = steps[steps.length - 1]
  const colors = ['#06b6d4', '#7c3aed', '#d97706', '#16a34a', '#2563eb', '#db2777']
  const nodeWidth = 150
  const svgWidth = 980
  const svgHeight = 260
  const gap = svgWidth / Math.max(steps.slice(0, 5).length, 1)
  const nodes = steps.slice(0, 5).map((step, index) => ({
    x: 54 + index * gap,
    y: index % 2 ? 132 : 52,
    color: colors[index % colors.length],
    label: escapeHtml(step.title.slice(0, 32)),
    index,
  }))
  const edges = nodes.slice(1).map((node, index) => {
    const prev = nodes[index]
    return `<path class="edge" d="M ${prev.x + nodeWidth} ${prev.y + 44} C ${prev.x + 205} ${prev.y + 44}, ${node.x - 55} ${node.y + 44}, ${node.x} ${node.y + 44}" fill="none" stroke="#64748b" stroke-width="3" marker-end="url(#arrow)" style="animation-delay:${0.2 + index * 0.16}s"></path>`
  }).join('')
  const boxes = nodes.map((node) => `
    <g class="node" style="animation-delay:${0.1 + node.index * 0.16}s">
      <rect x="${node.x}" y="${node.y}" width="${nodeWidth}" height="88" rx="18" fill="#fff" stroke="${node.color}" stroke-width="3"></rect>
      <circle cx="${node.x + 24}" cy="${node.y + 24}" r="14" fill="${node.color}"></circle>
      <text x="${node.x + 24}" y="${node.y + 29}" text-anchor="middle" fill="#fff" font-size="13" font-weight="900">${node.index + 1}</text>
      <foreignObject x="${node.x + 18}" y="${node.y + 42}" width="114" height="40"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:13px;font-weight:850;line-height:1.25;color:#0f172a;text-align:center">${node.label}</div></foreignObject>
    </g>
  `).join('')
  return `
    <div class="shell">
      <section class="hero">
        <p class="kicker">${zh ? '动态 HTML 动画白板' : 'Dynamic HTML animation board'}</p>
        <h1>${escapeHtml(payload.title)}</h1>
        <div class="summary">${summary.slice(0, 3).map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</div>
      </section>
      <section class="timeline">
        ${steps.map((step, index) => `
          <article class="step">
            <span class="badge">${index + 1}</span>
            <p class="stage">${escapeHtml(step.stage || (zh ? '阶段' : 'stage'))}</p>
            <h2 class="title">${escapeHtml(step.title)}</h2>
            <p class="text">${escapeHtml(step.markdown || step.summary.join(' ') || (zh ? '等待解释内容。' : 'Waiting for explanation.')).slice(0, 260)}</p>
          </article>
        `).join('')}
      </section>
      <section class="formula-flow">
        <div class="formula-box"><p class="formula-label">${zh ? '输入 / 已知量' : 'Input / known'}</p><p class="formula-text">${escapeHtml(formulaHint(first, zh ? 'x, 条件, 约束' : 'x, conditions, constraints'))}</p></div>
        <div class="arrow"></div>
        <div class="formula-box"><p class="formula-label">${zh ? '核心关系 / 变换' : 'Core relation / transform'}</p><p class="formula-text">${escapeHtml(formulaHint(mid, zh ? 'y = f(x, θ)' : 'y = f(x, theta)'))}</p></div>
        <div class="arrow"></div>
        <div class="formula-box"><p class="formula-label">${zh ? '输出 / 检查' : 'Output / check'}</p><p class="formula-text">${escapeHtml(formulaHint(last, zh ? '结论 + 边界检查' : 'answer + boundary check'))}</p></div>
      </section>
      <section class="diagram">
        <p class="diagram-title">${zh ? '最终总图' : 'Final diagram'}</p>
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="Final animated diagram">
          <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L10,3 L0,6 Z" fill="#64748b"></path></marker></defs>
          ${edges}
          ${boxes}
        </svg>
      </section>
    </div>
  `
}

function buildWhiteboardHtmlDocument(payload: WhiteboardPlayerPayload) {
  const body = payload.html ? `<div class="shell custom-html">${sanitizeEmbeddedHtml(payload.html)}</div>` : buildGeneratedAnimationHtml(payload)
  return `<!doctype html>
<html lang="${payload.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';">
  <title>${escapeHtml(payload.title)}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f8fafc;color:#0f172a;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{overflow:auto}.root{min-height:100vh;padding:24px;background:radial-gradient(circle at 18% 12%,rgba(6,182,212,.18),transparent 26%),radial-gradient(circle at 84% 18%,rgba(124,58,237,.16),transparent 30%),linear-gradient(135deg,#f8fafc 0%,#eef6ff 52%,#fff7ed 100%)}.shell{max-width:1180px;margin:0 auto}.hero{display:grid;gap:12px;margin-bottom:18px}.kicker{margin:0;color:#0891b2;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}h1{margin:0;font-size:clamp(26px,4vw,46px);line-height:1.05;letter-spacing:-.045em}.summary{display:grid;gap:8px;margin:0 0 18px;color:#64748b;font-size:15px;line-height:1.65}.timeline{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:22px 0}.timeline:before{content:"";position:absolute;left:7%;right:7%;top:38px;height:4px;border-radius:99px;background:linear-gradient(90deg,#06b6d4,#7c3aed,#16a34a);transform-origin:left;animation:grow 1.2s .15s both cubic-bezier(.22,1,.36,1)}.step{position:relative;z-index:1;min-height:180px;border:1px solid rgba(148,163,184,.45);border-radius:22px;background:rgba(255,255,255,.88);padding:16px;box-shadow:0 20px 55px rgba(15,23,42,.08);opacity:0;transform:translateY(18px) scale(.97);animation:cardIn .62s both cubic-bezier(.22,1,.36,1)}.step:nth-child(2){animation-delay:.18s}.step:nth-child(3){animation-delay:.36s}.step:nth-child(4){animation-delay:.54s}.step:nth-child(5){animation-delay:.72s}.badge{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:16px;background:#0f172a;color:#fff;font-size:17px;font-weight:950;box-shadow:0 10px 28px rgba(15,23,42,.18)}.stage{margin:14px 0 4px;color:#0891b2;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.12em}.title{margin:0;font-size:17px;line-height:1.25;font-weight:950;letter-spacing:-.02em}.text{margin:10px 0 0;color:#475569;font-size:13px;line-height:1.58}.formula-flow{margin-top:20px;display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:10px;align-items:center;border-radius:24px;background:#0f172a;color:#e0f2fe;padding:18px;overflow:hidden;box-shadow:inset 0 1px rgba(255,255,255,.08),0 22px 50px rgba(15,23,42,.22)}.formula-box{border:1px solid rgba(125,211,252,.24);border-radius:18px;padding:14px;background:rgba(15,23,42,.74);min-height:112px;opacity:0;animation:glowIn .62s both ease-out}.formula-box:nth-child(3){animation-delay:.28s}.formula-box:nth-child(5){animation-delay:.56s}.formula-label{margin:0 0 8px;color:#67e8f9;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.formula-text{margin:0;color:#f8fafc;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:14px;line-height:1.6}.arrow{width:42px;height:4px;border-radius:99px;background:linear-gradient(90deg,#22d3ee,#a78bfa);transform-origin:left;animation:grow .8s .34s both}.diagram{margin-top:22px;border:1px solid rgba(148,163,184,.48);border-radius:26px;background:rgba(255,255,255,.88);padding:16px;box-shadow:0 22px 60px rgba(15,23,42,.09)}.diagram-title{margin:0 0 10px;color:#64748b;font-size:12px;font-weight:950;letter-spacing:.16em;text-transform:uppercase}svg{display:block;width:100%;height:auto;overflow:visible}.node{opacity:0;transform-box:fill-box;transform-origin:center;animation:nodeIn .58s both cubic-bezier(.22,1,.36,1)}.edge{stroke-dasharray:420;stroke-dashoffset:420;animation:draw 1s .25s both ease-out}.custom-html>*{max-width:100%}@keyframes cardIn{to{opacity:1;transform:none}}@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes glowIn{from{opacity:0;transform:translateY(12px);filter:blur(3px)}to{opacity:1;transform:none;filter:blur(0)}}@keyframes nodeIn{from{opacity:0;transform:translateY(14px) scale(.94)}to{opacity:1;transform:none}}@keyframes draw{to{stroke-dashoffset:0}}@media(max-width:820px){.root{padding:14px}.timeline{grid-template-columns:1fr}.timeline:before{display:none}.formula-flow{grid-template-columns:1fr}.arrow{width:4px;height:34px;margin:0 auto;transform-origin:top;animation-name:growY}}@keyframes growY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
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
  const [viewMode, setViewMode] = useState<BoardViewMode>('html')

  useEffect(() => {
    setBoardCleared(false)
  }, [challengeId, diagram])

  useEffect(() => {
    setViewMode('html')
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
