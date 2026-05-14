import type { Challenge } from './types'

export type WhiteboardLocale = 'zh' | 'en'
export type ExcalidrawWhiteboardElement = Record<string, unknown>
export type ExcalidrawWhiteboardPayload = { elements: ExcalidrawWhiteboardElement[]; note?: string }

const EXCALIDRAW_OPEN = '[EXCALIDRAW_ELEMENTS]'
const EXCALIDRAW_CLOSE = '[/EXCALIDRAW_ELEMENTS]'
const WHITEBOARD_SKILL = 'arena-whiteboard-coach'
const MAX_ELEMENTS = 36
const MAX_POINTS = 8
const DEFAULT_FONT_FAMILY = 2
const DEFAULT_LINE_HEIGHT = 1.25
const COORDS = { minX: 40, maxX: 1320, minY: 24, maxY: 780, minW: 40, maxW: 760, minH: 32, maxH: 340 }
const ALLOWED_ELEMENT_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'text'])

function compactText(text: string, max = 62) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized
}

function includesAny(challenge: Challenge, words: string[]) {
  const haystack = `${challenge.id} ${challenge.slug} ${challenge.category} ${challenge.title} ${challenge.description} ${challenge.tags.join(' ')}`.toLowerCase()
  return words.some((word) => haystack.includes(word.toLowerCase()))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function safeNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(number)) return fallback
  return clamp(Math.round(number), min, max)
}

function safeString(value: unknown, max = 1200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeId(value: unknown, fallback: string) {
  const id = safeString(value, 80).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return id || fallback
}

function safeColor(value: unknown, fallback: string) {
  const color = safeString(value, 24)
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback
}

function conceptSummary(challenge: Challenge) {
  return (challenge.concepts?.length ? challenge.concepts : challenge.tags).slice(0, 6).join(', ')
}

function whiteboardBlueprint(template: NonNullable<Challenge['whiteboard_template']>, zh: boolean) {
  const shared = zh
    ? '必须包含：目标/SLO、输入或数据层、核心算法/模型、在线服务或运行时、指标监控、trade-off 与失败场景。'
    : 'Must include: goal/SLO, input or data layer, core algorithm/model, serving or runtime path, metrics/monitoring, trade-offs and failure modes.'
  const byTemplate: Record<NonNullable<Challenge['whiteboard_template']>, string> = {
    system_architecture: zh
      ? '画端到端系统架构：入口、召回/候选、特征、模型/排序、服务、实验与反馈闭环。'
      : 'Draw an end-to-end system architecture: entrypoint, retrieval/candidates, features, model/ranking, serving, experiments, and feedback loop.',
    pipeline: zh
      ? '画 pipeline：离线准备、索引/训练、在线查询、重排/生成、评测与迭代。'
      : 'Draw the pipeline: offline preparation, indexing/training, online query path, rerank/generation, evaluation, and iteration.',
    training_serving_consistency: zh
      ? '画训练/在线一致性：point-in-time 数据、离线回填、在线读取、版本、血缘、监控。'
      : 'Draw training-serving consistency: point-in-time data, offline backfill, online reads, versions, lineage, and monitoring.',
    inference_flow: zh
      ? '画推理链路：prefill/decode、KV cache、batching、路由、限流、降级、成本与 SLO。'
      : 'Draw the inference flow: prefill/decode, KV cache, batching, routing, rate limits, fallback, cost, and SLO.',
    evaluation_loop: zh
      ? '画评测闭环：黄金集、自动/人工评测、线上指标、告警、回滚、回归测试。'
      : 'Draw the evaluation loop: golden set, automated/human judging, online metrics, alerts, rollback, and regression tests.',
    solution_flow: zh
      ? '画解题流程：问题抽象、核心不变量、算法步骤、复杂度、边界条件。'
      : 'Draw the solution flow: abstraction, invariants, algorithm steps, complexity, and edge cases.',
  }
  return `${byTemplate[template]} ${shared}`
}

function textElement(id: string, text: string, x: number, y: number, fontSize = 20, width = 300, color = '#0f172a'): ExcalidrawWhiteboardElement {
  const cleanText = safeString(text, 900)
  return {
    type: 'text',
    id,
    x,
    y,
    text: cleanText,
    originalText: cleanText,
    fontSize,
    fontFamily: DEFAULT_FONT_FAMILY,
    lineHeight: DEFAULT_LINE_HEIGHT,
    width,
    height: Math.max(28, cleanText.split('\n').length * fontSize * DEFAULT_LINE_HEIGHT),
    strokeColor: color,
    backgroundColor: 'transparent',
    textAlign: 'left',
    verticalAlign: 'top',
  }
}

function boxElements(id: string, text: string, x: number, y: number, color: string, bg: string): ExcalidrawWhiteboardElement[] {
  return [
    {
      type: 'rectangle',
      id,
      x,
      y,
      width: 210,
      height: 92,
      strokeColor: color,
      backgroundColor: bg,
      fillStyle: 'solid',
      roundness: { type: 3 },
      strokeWidth: 2,
    },
    textElement(`${id}-label`, text, x + 14, y + 18, 20, 182),
  ]
}

function arrowElement(id: string, x: number, y: number, dx: number, dy: number, label?: string): ExcalidrawWhiteboardElement {
  return {
    type: 'arrow',
    id,
    x,
    y,
    points: [[0, 0], [dx, dy]],
    strokeColor: '#475569',
    strokeWidth: 2,
    endArrowhead: 'arrow',
    label: label ? { text: safeString(label, 60), fontSize: 16 } : undefined,
  }
}

function sectionElements(id: string, title: string, items: string[], x: number, y: number, color: string): ExcalidrawWhiteboardElement[] {
  const visibleItems = items.slice(0, 4).map((item) => `- ${safeString(item, 180)}`)
  const body = [title, '', ...visibleItems].join('\n')
  return [
    {
      type: 'rectangle',
      id,
      x,
      y,
      width: 560,
      height: Math.max(150, 78 + visibleItems.length * 34),
      strokeColor: color,
      backgroundColor: '#ffffff',
      fillStyle: 'solid',
      roundness: { type: 3 },
      strokeWidth: 2,
    },
    textElement(`${id}-text`, body, x + 18, y + 16, 20, 524),
  ]
}

function sanitizePoints(value: unknown) {
  const points = Array.isArray(value) ? value : []
  const sanitized = points.slice(0, MAX_POINTS).map((point) => {
    if (!Array.isArray(point)) return null
    return [
      safeNumber(point[0], 0, -1400, 1400),
      safeNumber(point[1], 0, -900, 900),
    ]
  }).filter((point): point is number[] => Boolean(point))
  return sanitized.length >= 2 ? sanitized : [[0, 0], [160, 0]]
}

function labelText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return safeString(value, 240)
  if (isRecord(value)) return safeString(value.text, 240)
  return ''
}

function companionTextElement(id: string, text: string, x: number, y: number, width: number, fontSize = 20) {
  return textElement(id, text, x, y, fontSize, Math.max(80, width), '#0f172a')
}

function sanitizeExcalidrawElement(element: unknown, index: number): ExcalidrawWhiteboardElement[] {
  if (!isRecord(element)) return []
  const type = safeString(element.type, 32)
  if (!ALLOWED_ELEMENT_TYPES.has(type)) return []
  const id = safeId(element.id, `arena-el-${index}`)
  const x = safeNumber(element.x, 80 + (index % 5) * 250, COORDS.minX, COORDS.maxX)
  const y = safeNumber(element.y, 120 + Math.floor(index / 5) * 120, COORDS.minY, COORDS.maxY)
  const base: ExcalidrawWhiteboardElement = {
    type,
    id,
    x,
    y,
    strokeColor: safeColor(element.strokeColor, '#334155'),
    backgroundColor: safeColor(element.backgroundColor, 'transparent'),
    strokeWidth: safeNumber(element.strokeWidth, 2, 1, 4),
    fillStyle: ['solid', 'hachure', 'cross-hatch'].includes(String(element.fillStyle)) ? element.fillStyle : 'solid',
    roundness: isRecord(element.roundness) ? element.roundness : { type: 3 },
  }

  if (type === 'text') {
    const text = safeString(element.text ?? element.label, 900)
    if (!text) return []
    return [{
      ...base,
      text,
      originalText: safeString(element.originalText, 900) || text,
      fontSize: safeNumber(element.fontSize, 20, 14, 36),
      fontFamily: safeNumber(element.fontFamily, DEFAULT_FONT_FAMILY, 1, 9),
      lineHeight: typeof element.lineHeight === 'number' ? element.lineHeight : DEFAULT_LINE_HEIGHT,
      width: safeNumber(element.width, 320, COORDS.minW, COORDS.maxW),
      height: safeNumber(element.height, Math.max(28, text.split('\n').length * 20 * DEFAULT_LINE_HEIGHT), COORDS.minH, COORDS.maxH),
      backgroundColor: 'transparent',
      textAlign: ['left', 'center', 'right'].includes(String(element.textAlign)) ? element.textAlign : 'left',
      verticalAlign: ['top', 'middle', 'bottom'].includes(String(element.verticalAlign)) ? element.verticalAlign : 'top',
    }]
  }

  if (type === 'arrow' || type === 'line') {
    const points = sanitizePoints(element.points)
    const line = {
      ...base,
      points,
      endArrowhead: type === 'arrow' ? 'arrow' : undefined,
    }
    const label = labelText(element.label ?? element.text)
    if (!label) return [line]
    const [start, end] = points
    const labelX = x + (start[0] + end[0]) / 2 - 28
    const labelY = y + (start[1] + end[1]) / 2 - 22
    return [line, companionTextElement(`${id}-label`, label, labelX, labelY, 120, safeNumber(isRecord(element.label) ? element.label.fontSize : undefined, 16, 12, 24))]
  }

  const width = safeNumber(element.width, 210, COORDS.minW, COORDS.maxW)
  const height = safeNumber(element.height, 92, COORDS.minH, COORDS.maxH)
  const shape = {
    ...base,
    width,
    height,
  }
  const label = labelText(element.text ?? element.label ?? element.title)
  if (!label) return [shape]
  return [{
    ...shape,
    customData: { label },
  }]
}

export function sanitizeExcalidrawElements(elements: unknown[]): ExcalidrawWhiteboardElement[] {
  const sanitized: ExcalidrawWhiteboardElement[] = []
  elements.slice(0, MAX_ELEMENTS).forEach((element, index) => {
    const group = sanitizeExcalidrawElement(element, index)
    sanitized.push(...group)
    const shape = group.find((item) => ['rectangle', 'ellipse', 'diamond'].includes(safeString(item.type, 32)))
    const hasText = group.some((item) => item.type === 'text')
    const label = isRecord(shape?.customData) ? safeString(shape.customData.label, 240) : ''
    if (shape && !hasText && label) {
      sanitized.push(companionTextElement(
        `${safeId(shape.id, `arena-el-${index}`)}-label`,
        label,
        safeNumber(shape.x, 80, COORDS.minX, COORDS.maxX) + 14,
        safeNumber(shape.y, 120, COORDS.minY, COORDS.maxY) + 18,
        safeNumber(shape.width, 210, COORDS.minW, COORDS.maxW) - 28,
      ))
    }
  })
  return sanitized.slice(0, MAX_ELEMENTS)
}

export function makeInterviewWhiteboardElements(challenge: Challenge, locale: WhiteboardLocale): ExcalidrawWhiteboardElement[] {
  const zh = locale === 'zh'
  const isRag = includesAny(challenge, ['rag', 'retrieval', 'embedding', 'search'])
  const isLlm = includesAny(challenge, ['llm', 'transformer', 'kv cache', 'serving'])
  const isRisk = includesAny(challenge, ['fraud', 'risk'])
  const isFeature = includesAny(challenge, ['feature store', 'feature-store'])
  const isMonitoring = includesAny(challenge, ['monitoring', 'drift'])
  const isKernel = includesAny(challenge, ['gpu', 'kernel', 'layernorm'])

  const data = isRag
    ? zh ? 'Chunk + Embed' : 'Chunk + embed'
    : isFeature
      ? zh ? '离线/在线特征' : 'Offline/online features'
      : isRisk
        ? zh ? '实时事件流' : 'Realtime stream'
        : zh ? '数据/特征' : 'Data/features'
  const core = isKernel
    ? zh ? 'Kernel 并行化' : 'Kernel parallelism'
    : isLlm
      ? zh ? '模型 + KV Cache' : 'Model + KV cache'
      : isRag
        ? zh ? '召回/重排/生成' : 'Retrieve/rerank/generate'
        : zh ? '核心模型/策略' : 'Core model/strategy'
  const serve = isKernel
    ? zh ? 'Benchmark + 验证' : 'Benchmark + verify'
    : isLlm
      ? zh ? 'Batching + 降级' : 'Batching + fallback'
      : zh ? '在线服务/实验' : 'Serving/experiments'
  const evalNode = isMonitoring
    ? zh ? '漂移/告警/回滚' : 'Drift/alert/rollback'
    : zh ? '指标/监控/迭代' : 'Metrics/monitor/iterate'

  const checklist = isRag
    ? [zh ? '权限过滤前后都要校验' : 'Check permissions before and after retrieval', zh ? '引用溯源降低幻觉' : 'Use citations to reduce hallucination', zh ? '离线评测连接线上反馈' : 'Connect offline eval to online feedback']
    : isLlm
      ? [zh ? '吞吐：continuous batching / KV cache' : 'Throughput: continuous batching / KV cache', zh ? '成本：量化、路由、缓存' : 'Cost: quantization, routing, caching', zh ? 'SLO：延迟、错误率、降级' : 'SLO: latency, errors, fallback']
      : isFeature
        ? [zh ? 'Point-in-time correctness' : 'Point-in-time correctness', zh ? '训练/在线一致性' : 'Training/serving consistency', zh ? '血缘、版本、监控' : 'Lineage, versions, monitoring']
        : isKernel
          ? [zh ? '内存访问与 coalescing' : 'Memory access and coalescing', zh ? '归约与 block/warp 划分' : 'Reduction and block/warp layout', zh ? '数值稳定性与 benchmark' : 'Numerical stability and benchmark']
          : [zh ? '指标先行：业务 + 模型' : 'Metrics first: business + model', zh ? '多阶段架构，先简单可靠' : 'Multi-stage design, simple first', zh ? 'A/B、监控、回滚保证上线安全' : 'A/B, monitoring, rollback for launch safety']

  return [
    textElement('title', zh ? `答案结构：${challenge.title}` : `Answer map: ${challenge.title}`, 70, 45, 34, 920),
    textElement('subtitle', zh ? `关键知识点：${compactText(conceptSummary(challenge), 72)}` : `Concepts: ${compactText(conceptSummary(challenge), 72)}`, 80, 92, 18, 760, '#64748b'),
    ...boxElements('goal', zh ? '目标 / SLO' : 'Goal / SLO', 80, 145, '#0f766e', '#ccfbf1'),
    ...boxElements('inputs', data, 350, 145, '#7c3aed', '#ede9fe'),
    ...boxElements('core', core, 620, 145, '#d97706', '#ffedd5'),
    ...boxElements('serve', serve, 890, 145, '#16a34a', '#dcfce7'),
    ...boxElements('eval', evalNode, 1160, 145, '#dc2626', '#fee2e2'),
    arrowElement('goal-inputs-arrow', 290, 191, 60, 0, zh ? '限定' : 'scope'),
    arrowElement('inputs-core-arrow', 560, 191, 60, 0, zh ? '推导' : 'derive'),
    arrowElement('core-serve-arrow', 830, 191, 60, 0, zh ? '上线' : 'ship'),
    arrowElement('serve-eval-arrow', 1100, 191, 60, 0, zh ? '观测' : 'observe'),
    ...sectionElements('framework', zh ? '面试回答框架' : 'Answer framework', [
      zh ? '先复述目标、规模、SLO 与核心指标。' : 'Restate goal, scale, SLO, and primary metrics.',
      zh ? '画数据 -> 模型 -> 服务 -> 反馈闭环。' : 'Draw data -> model -> serving -> feedback.',
      zh ? '主动讲延迟、准确率、成本、安全 trade-off。' : 'Explain latency, quality, cost, and safety trade-offs.',
      zh ? '最后落到实验、监控、回滚和迭代。' : 'End with experiments, monitoring, rollback, and iteration.',
    ], 90, 365, '#0f766e'),
    ...sectionElements('risks', zh ? '关键追问点' : 'Likely follow-ups', checklist, 700, 365, '#7c3aed'),
  ]
}

export function makeAnswerWhiteboardElements(challenge: Challenge, locale: WhiteboardLocale, answer: string): ExcalidrawWhiteboardElement[] {
  const zh = locale === 'zh'
  const summary = safeString(answer, 900)
    .replace(/\[EXCALIDRAW_ELEMENTS\][\s\S]*?\[\/EXCALIDRAW_ELEMENTS\]/gi, '')
    .split(/[\n。.!?；;]+/)
    .map((item) => item.replace(/^[-*•\d.\s]+/, '').trim())
    .filter((item) => item.length > 12)
    .slice(0, 4)
  const focusItems = summary.length ? summary : [
    zh ? '明确目标、约束和核心指标' : 'Clarify goal, constraints, and primary metric',
    zh ? '连接输入、核心方案和服务路径' : 'Connect inputs, core solution, and serving path',
    zh ? '补充 trade-off、监控和失败场景' : 'Add trade-offs, monitoring, and failure modes',
  ]

  return [
    textElement('title', zh ? `本轮答案结构：${challenge.title}` : `This answer: ${challenge.title}`, 70, 45, 34, 920),
    textElement('subtitle', zh ? `由本轮 Agent 回答生成：${compactText(conceptSummary(challenge), 72)}` : `Generated from the latest Agent answer: ${compactText(conceptSummary(challenge), 72)}`, 80, 92, 18, 760, '#64748b'),
    ...boxElements('goal', zh ? '目标 / 指标' : 'Goal / metric', 80, 145, '#0f766e', '#ccfbf1'),
    ...boxElements('inputs', zh ? '输入 / 约束' : 'Inputs / constraints', 350, 145, '#7c3aed', '#ede9fe'),
    ...boxElements('core', zh ? '核心方案' : 'Core solution', 620, 145, '#d97706', '#ffedd5'),
    ...boxElements('serve', zh ? '服务 / 验证' : 'Serve / validate', 890, 145, '#16a34a', '#dcfce7'),
    arrowElement('goal-inputs-arrow', 290, 191, 60, 0, zh ? '限定' : 'scope'),
    arrowElement('inputs-core-arrow', 560, 191, 60, 0, zh ? '推导' : 'derive'),
    arrowElement('core-serve-arrow', 830, 191, 60, 0, zh ? '落地' : 'ship'),
    ...sectionElements('focus', zh ? '本轮重点' : 'This answer emphasizes', focusItems, 90, 365, '#0f766e'),
    ...sectionElements('risks', zh ? '追问 / 风险' : 'Follow-ups / risks', [
      zh ? '瓶颈在哪里，如何量化？' : 'Where is the bottleneck and how is it measured?',
      zh ? '上线后如何监控、回滚和迭代？' : 'How is it monitored, rolled back, and iterated after launch?',
    ], 700, 365, '#7c3aed'),
  ]
}

export function makeWhiteboardPrompt(challenge: Challenge, locale: WhiteboardLocale, stepMode = false) {
  const zh = locale === 'zh'
  const template = challenge.whiteboard_template || 'solution_flow'
  const concepts = conceptSummary(challenge)
  const blueprint = whiteboardBlueprint(template, zh)
  const focus = zh
    ? `使用 ${WHITEBOARD_SKILL} skill。白板必须表达“理想答案结构”，不是重排题面。模板=${template}，知识点=${concepts}。${blueprint}`
    : `Use the ${WHITEBOARD_SKILL} skill. The board must express the ideal answer structure, not restate the prompt. Template=${template}, concepts=${concepts}. ${blueprint}`
  const constraints = zh
    ? `题目约束只用于确定场景，不要逐字复制到白板：${challenge.description}`
    : `Problem constraints are only for grounding; do not copy them into the board: ${challenge.description}`
  const phases = zh
    ? '按阶段组织：goal 目标/SLO -> inputs 输入/数据/约束 -> core 核心算法/模型/架构 -> serve 在线服务/运行时 -> eval 指标/监控/实验 -> risks 风险/失败场景。'
    : 'Organize by phases: goal/SLO -> inputs/data/constraints -> core algorithm/model/architecture -> serving/runtime -> eval/monitoring/experiments -> risks/failure modes.'
  const limits = zh
    ? '控制规模：4-6 个 answer box、1-2 个 section、3-5 条 arrow，总 elements 不超过 24。短标签，留足间距。'
    : 'Keep it compact: 4-6 answer boxes, 1-2 sections, 3-5 arrows, at most 24 elements. Use short labels and generous spacing.'
  const example = JSON.stringify({
    elements: [
      { type: 'text', id: 'title', x: 70, y: 45, text: '答案结构', fontSize: 34, width: 720 },
      { type: 'rectangle', id: 'goal', x: 80, y: 145, width: 210, height: 92, strokeColor: '#0f766e', backgroundColor: '#ccfbf1', fillStyle: 'solid', roundness: { type: 3 } },
      { type: 'text', id: 'goal-label', x: 94, y: 163, text: '目标/SLO', fontSize: 20, width: 182 },
      { type: 'rectangle', id: 'core', x: 620, y: 145, width: 210, height: 92, strokeColor: '#d97706', backgroundColor: '#ffedd5', fillStyle: 'solid', roundness: { type: 3 } },
      { type: 'text', id: 'core-label', x: 634, y: 163, text: '核心方案', fontSize: 20, width: 182 },
      { type: 'arrow', id: 'goal-core-arrow', x: 290, y: 191, points: [[0, 0], [330, 0]], endArrowhead: 'arrow', label: { text: '推导', fontSize: 16 } },
    ],
  })
  return zh
    ? `请作为 AI 面试官和白板讲解老师，围绕「${challenge.title}」进行${stepMode ? '逐步' : '完整'}答案白板推导。\n\n${focus}\n${phases}\n${limits}\n${constraints}\n\n请先用自然语言讲解理想答案，然后必须输出一个 Excalidraw-compatible JSON 块，格式如下：\n${EXCALIDRAW_OPEN}\n${example}\n${EXCALIDRAW_CLOSE}\n\n硬性要求：只使用 rectangle/text/arrow/line/ellipse/diamond；所有 rectangle/text 必须写答案组件、设计决策、指标或 trade-off；不要把题目原文、题目要求列表、或“请设计...”画进白板；不要输出 WHITEBOARD_OPS。`
    : `Act as an AI interviewer and whiteboard instructor for "${challenge.title}". Produce a ${stepMode ? 'step-by-step' : 'complete'} answer whiteboard derivation.\n\n${focus}\n${phases}\n${limits}\n${constraints}\n\nFirst explain the ideal answer in natural language, then include an Excalidraw-compatible JSON block exactly like this:\n${EXCALIDRAW_OPEN}\n${example}\n${EXCALIDRAW_CLOSE}\n\nHard requirements: use only rectangle/text/arrow/line/ellipse/diamond; every rectangle/text must contain answer components, design decisions, metrics, or trade-offs; do not draw the prompt text, requirement list, or "design ..." wording; do not output WHITEBOARD_OPS.`
}

export function extractWhiteboardPayload(content: string): ExcalidrawWhiteboardPayload | null {
  const source = content || ''
  const tagged = source.match(/\[EXCALIDRAW_ELEMENTS\]([\s\S]*?)\[\/EXCALIDRAW_ELEMENTS\]/i)
  const candidates = tagged ? [tagged[1]] : []
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?"elements"[\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1])
  if (!candidates.length && source.trim().startsWith('{') && source.includes('"elements"')) candidates.push(source)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as Partial<ExcalidrawWhiteboardPayload>
      if (Array.isArray(parsed.elements)) {
        const elements = sanitizeExcalidrawElements(parsed.elements)
        if (elements.length) return { elements, note: safeString(parsed.note, 240) || undefined }
      }
    } catch {
      // Ignore malformed Agent output and keep chat usable.
    }
  }
  return null
}

export function stripWhiteboardPayload(content: string) {
  return (content || '')
    .replace(/\[EXCALIDRAW_ELEMENTS\][\s\S]*?\[\/EXCALIDRAW_ELEMENTS\]/gi, '')
    .replace(/\[WHITEBOARD_OPS\][\s\S]*?\[\/WHITEBOARD_OPS\]/gi, '')
    .replace(/```(?:json)?\s*\{[\s\S]*?"elements"[\s\S]*?\}\s*```/gi, '')
    .trim()
}
