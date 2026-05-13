import type { Challenge } from './types'

export type WhiteboardLocale = 'zh' | 'en'
export type WhiteboardOp =
  | { type: 'clear' }
  | { type: 'title'; text: string; x?: number; y?: number }
  | { type: 'text'; text: string; x: number; y: number; size?: 'sm' | 'md' | 'lg'; color?: string }
  | { type: 'box'; id?: string; text: string; x: number; y: number; w?: number; h?: number; color?: string; bg?: string }
  | { type: 'arrow'; from?: string; to?: string; x1?: number; y1?: number; x2?: number; y2?: number; label?: string; color?: string }
  | { type: 'section'; id?: string; title: string; items: string[]; x: number; y: number; w?: number; color?: string }

export type WhiteboardPayload = { ops: WhiteboardOp[]; note?: string }

const WHITEBOARD_OPEN = '[WHITEBOARD_OPS]'
const WHITEBOARD_CLOSE = '[/WHITEBOARD_OPS]'
const MAX_WHITEBOARD_OPS = 64
const MAX_SECTION_ITEMS = 8
const COORDS = { minX: 40, maxX: 1320, minY: 24, maxY: 760, minW: 80, maxW: 720, minH: 56, maxH: 320 }

function compactText(text: string, max = 62) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
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

function safeId(value: unknown) {
  const id = safeString(value, 80).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return id || undefined
}

function safeColor(value: unknown) {
  const color = safeString(value, 24)
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : undefined
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

function sanitizeWhiteboardOp(op: unknown, index: number): WhiteboardOp | null {
  if (!isRecord(op)) return null
  const type = safeString(op.type, 32)
  if (type === 'clear') return { type: 'clear' }
  if (type === 'title') {
    const text = safeString(op.text, 180)
    if (!text) return null
    return { type: 'title', text, x: safeNumber(op.x, 70, COORDS.minX, COORDS.maxX), y: safeNumber(op.y, 45, COORDS.minY, COORDS.maxY) }
  }
  if (type === 'text') {
    const text = safeString(op.text, 800)
    if (!text) return null
    const size = op.size === 'sm' || op.size === 'md' || op.size === 'lg' ? op.size : undefined
    return { type: 'text', text, x: safeNumber(op.x, 80, COORDS.minX, COORDS.maxX), y: safeNumber(op.y, 100 + index * 18, COORDS.minY, COORDS.maxY), size, color: safeColor(op.color) }
  }
  if (type === 'box') {
    const text = safeString(op.text, 360)
    if (!text) return null
    return {
      type: 'box',
      id: safeId(op.id),
      text,
      x: safeNumber(op.x, 80 + (index % 4) * 240, COORDS.minX, COORDS.maxX),
      y: safeNumber(op.y, 130 + Math.floor(index / 4) * 120, COORDS.minY, COORDS.maxY),
      w: safeNumber(op.w, 190, COORDS.minW, COORDS.maxW),
      h: safeNumber(op.h, 86, COORDS.minH, COORDS.maxH),
      color: safeColor(op.color),
      bg: safeColor(op.bg),
    }
  }
  if (type === 'arrow') {
    const from = safeId(op.from)
    const to = safeId(op.to)
    const label = safeString(op.label, 80)
    const color = safeColor(op.color)
    if (from && to) return { type: 'arrow', from, to, label: label || undefined, color }
    const hasCoords = [op.x1, op.y1, op.x2, op.y2].every((value) => Number.isFinite(typeof value === 'number' ? value : Number(value)))
    if (!hasCoords) return null
    return {
      type: 'arrow',
      x1: safeNumber(op.x1, 120, COORDS.minX, COORDS.maxX),
      y1: safeNumber(op.y1, 160, COORDS.minY, COORDS.maxY),
      x2: safeNumber(op.x2, 320, COORDS.minX, COORDS.maxX),
      y2: safeNumber(op.y2, 160, COORDS.minY, COORDS.maxY),
      label: label || undefined,
      color,
    }
  }
  if (type === 'section') {
    const title = safeString(op.title, 120)
    if (!title) return null
    const items = Array.isArray(op.items) ? op.items.map((item) => safeString(item, 220)).filter(Boolean).slice(0, MAX_SECTION_ITEMS) : []
    return {
      type: 'section',
      id: safeId(op.id),
      title,
      items,
      x: safeNumber(op.x, 90, COORDS.minX, COORDS.maxX),
      y: safeNumber(op.y, 310, COORDS.minY, COORDS.maxY),
      w: safeNumber(op.w, 510, COORDS.minW, COORDS.maxW),
      color: safeColor(op.color),
    }
  }
  return null
}

export function sanitizeWhiteboardOps(ops: unknown[]): WhiteboardOp[] {
  const sanitized = ops.slice(0, MAX_WHITEBOARD_OPS).map(sanitizeWhiteboardOp).filter((op): op is WhiteboardOp => Boolean(op))
  if (!sanitized.some((op) => op.type === 'clear')) return [{ type: 'clear' }, ...sanitized]
  return sanitized
}

export function makeInterviewWhiteboardOps(challenge: Challenge, locale: WhiteboardLocale): WhiteboardOp[] {
  const zh = locale === 'zh'
  const isRag = includesAny(challenge, ['rag', 'retrieval', 'embedding', 'search'])
  const isLlm = includesAny(challenge, ['llm', 'transformer', 'kv cache', 'serving'])
  const isRisk = includesAny(challenge, ['fraud', 'risk'])
  const isFeature = includesAny(challenge, ['feature store', 'feature-store'])
  const isMonitoring = includesAny(challenge, ['monitoring', 'drift'])
  const isKernel = includesAny(challenge, ['gpu', 'kernel', 'layernorm'])

  const title = zh ? `白板推导：${challenge.title}` : `Whiteboard derivation: ${challenge.title}`
  const goal = zh ? '目标 / 约束 / 指标' : 'Goal / constraints / metrics'
  const data = isRag
    ? zh ? '文档解析 / Chunk / Embedding' : 'Parsing / chunks / embeddings'
    : isFeature
      ? zh ? '离线特征 / 在线特征 / PIT' : 'Offline / online features / PIT'
      : isRisk
        ? zh ? '实时事件流 / 标签延迟' : 'Realtime stream / delayed labels'
        : zh ? '数据与特征层' : 'Data and feature layer'
  const model = isKernel
    ? zh ? 'Kernel 算法 / 并行拆分' : 'Kernel algorithm / parallelization'
    : isLlm
      ? zh ? '模型 / Prompt / KV Cache' : 'Model / prompt / KV cache'
      : isRag
        ? zh ? '召回 / 重排 / 生成' : 'Retrieval / rerank / generation'
        : zh ? '模型与排序策略' : 'Model and ranking strategy'
  const serving = isKernel
    ? zh ? 'Benchmark / 数值验证 / 性能瓶颈' : 'Benchmark / correctness / bottlenecks'
    : isLlm
      ? zh ? '推理服务 / Batching / 降级' : 'Serving / batching / fallback'
      : zh ? '在线服务与实验' : 'Serving and experimentation'
  const feedback = isMonitoring
    ? zh ? '漂移监控 / 告警 / 回滚' : 'Drift monitoring / alert / rollback'
    : zh ? '反馈闭环 / 监控 / 迭代' : 'Feedback / monitoring / iteration'

  const boxes = [
    { id: 'goal', text: goal, x: 80, y: 130, color: '#3ce8e2', bg: '#e6fffb' },
    { id: 'data', text: data, x: 330, y: 130, color: '#8b5cf6', bg: '#f3e8ff' },
    { id: 'model', text: model, x: 580, y: 130, color: '#f59e0b', bg: '#fff7ed' },
    { id: 'serving', text: serving, x: 830, y: 130, color: '#22c55e', bg: '#ecfdf5' },
    { id: 'feedback', text: feedback, x: 1080, y: 130, color: '#ef4444', bg: '#fff1f2' },
  ]

  const checklist = isRag
    ? [zh ? '权限过滤必须在召回前后都校验' : 'Apply permission filters before/after retrieval', zh ? '引用溯源降低幻觉' : 'Citations reduce hallucination', zh ? '离线评测 + 在线反馈闭环' : 'Offline eval + online feedback loop']
    : isLlm
      ? [zh ? '吞吐：continuous batching / KV cache' : 'Throughput: continuous batching / KV cache', zh ? '成本：量化、路由、缓存' : 'Cost: quantization, routing, caching', zh ? 'SLO：延迟、错误率、降级' : 'SLO: latency, errors, fallback']
      : isFeature
        ? [zh ? 'Point-in-time correctness' : 'Point-in-time correctness', zh ? '训练/在线一致性' : 'Training/serving consistency', zh ? '血缘、版本、监控' : 'Lineage, versions, monitoring']
        : isKernel
          ? [zh ? '内存访问模式与 coalescing' : 'Memory access and coalescing', zh ? '归约与 warp/block 划分' : 'Reduction and warp/block layout', zh ? '数值稳定性与 benchmark' : 'Numerical stability and benchmark']
          : [zh ? '指标先行：业务指标 + 模型指标' : 'Metrics first: business + model metrics', zh ? '多阶段架构，先简单可靠' : 'Multi-stage design, simple first', zh ? 'A/B、监控、回滚保证上线安全' : 'A/B, monitoring, rollback for safe launch']

  return [
    { type: 'clear' },
    { type: 'title', text: title, x: 70, y: 45 },
    { type: 'text', text: zh ? `答案结构图 · 关键知识点：${compactText(conceptSummary(challenge), 72)}` : `Answer map · concepts: ${compactText(conceptSummary(challenge), 72)}`, x: 80, y: 88, size: 'sm', color: '#64748b' },
    ...boxes.map((box) => ({ type: 'box' as const, ...box, w: 190, h: 86 })),
    { type: 'arrow', from: 'goal', to: 'data', label: zh ? '定义输入' : 'define input' },
    { type: 'arrow', from: 'data', to: 'model', label: zh ? '建模' : 'model' },
    { type: 'arrow', from: 'model', to: 'serving', label: zh ? '上线' : 'serve' },
    { type: 'arrow', from: 'serving', to: 'feedback', label: zh ? '观测' : 'observe' },
    { type: 'section', title: zh ? '面试回答框架' : 'Answer framework', items: [
      zh ? '1. 先复述目标、用户规模、SLO 与核心指标。' : '1. Restate goal, scale, SLO, and primary metrics.',
      zh ? '2. 画端到端链路：数据 → 模型 → 服务 → 反馈。' : '2. Draw E2E path: data → model → serving → feedback.',
      zh ? '3. 主动讲 trade-off：延迟/准确率/成本/安全。' : '3. Explain trade-offs: latency / quality / cost / safety.',
      zh ? '4. 最后落到实验、监控、回滚和下一步迭代。' : '4. End with experiments, monitoring, rollback, and iteration.',
    ], x: 90, y: 310, w: 510, color: '#3ce8e2' },
    { type: 'section', title: zh ? '关键追问点' : 'Likely follow-ups', items: checklist, x: 670, y: 310, w: 510, color: '#a78bfa' },
    { type: 'text', text: zh ? '提示：让 Agent 继续追问“规模、指标、瓶颈、失败场景”，白板可继续迭代。' : 'Tip: ask the Agent to follow up on scale, metrics, bottlenecks, and failure cases; iterate the board.', x: 90, y: 575, size: 'sm', color: '#64748b' },
  ]
}

export function makeWhiteboardPrompt(challenge: Challenge, locale: WhiteboardLocale, stepMode = false) {
  const zh = locale === 'zh'
  const template = challenge.whiteboard_template || 'solution_flow'
  const concepts = conceptSummary(challenge)
  const blueprint = whiteboardBlueprint(template, zh)
  const focus = zh
    ? `白板必须表达“理想答案结构”，不是重排题面。模板=${template}，知识点=${concepts}。${blueprint}`
    : `The board must express the ideal answer structure, not restate the prompt. Template=${template}, concepts=${concepts}. ${blueprint}`
  const constraints = zh
    ? `题目约束只用于确定场景，不要逐字复制到白板：${challenge.description}`
    : `Problem constraints are only for grounding; do not copy them into the board: ${challenge.description}`
  return zh
    ? `请作为 AI 面试官和白板讲解老师，围绕「${challenge.title}」进行${stepMode ? '逐步' : '完整'}答案白板推导。\n\n${focus}\n${constraints}\n\n请先用自然语言讲解理想答案，然后必须输出一个白板 JSON 块，格式如下：\n${WHITEBOARD_OPEN}\n{"ops":[{"type":"clear"},{"type":"title","text":"..."},{"type":"box","id":"goal","text":"目标/SLO","x":80,"y":130,"w":190,"h":86},{"type":"box","id":"model","text":"核心方案","x":580,"y":130,"w":190,"h":86},{"type":"arrow","from":"goal","to":"model","label":"推导"},{"type":"section","title":"Trade-off / 风险","items":["..."],"x":90,"y":310,"w":510}]}\n${WHITEBOARD_CLOSE}\n\n硬性要求：所有 box/section 都必须写答案组件、设计决策、指标或 trade-off；不要把题目原文、题目要求列表、或“请设计...”画进白板；只输出 JSON ops，不要输出 JS；坐标范围 x 60-1250、y 40-720。`
    : `Act as an AI interviewer and whiteboard instructor for "${challenge.title}". Produce a ${stepMode ? 'step-by-step' : 'complete'} answer whiteboard derivation.\n\n${focus}\n${constraints}\n\nFirst explain the ideal answer in natural language, then include a whiteboard JSON block exactly like this:\n${WHITEBOARD_OPEN}\n{"ops":[{"type":"clear"},{"type":"title","text":"..."},{"type":"box","id":"goal","text":"Goal/SLO","x":80,"y":130,"w":190,"h":86},{"type":"box","id":"model","text":"Core solution","x":580,"y":130,"w":190,"h":86},{"type":"arrow","from":"goal","to":"model","label":"derive"},{"type":"section","title":"Trade-offs / risks","items":["..."],"x":90,"y":310,"w":510}]}\n${WHITEBOARD_CLOSE}\n\nHard requirements: every box/section must contain answer components, design decisions, metrics, or trade-offs; do not draw the prompt text, requirement list, or “design ...” wording; JSON ops only, no JS; coordinates x 60-1250, y 40-720.`
}

export function extractWhiteboardPayload(content: string): WhiteboardPayload | null {
  const source = content || ''
  const tagged = source.match(/\[WHITEBOARD_OPS\]([\s\S]*?)\[\/WHITEBOARD_OPS\]/i)
  const candidates = tagged ? [tagged[1]] : []
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?"ops"[\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1])
  if (!candidates.length && source.trim().startsWith('{') && source.includes('"ops"')) candidates.push(source)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as Partial<WhiteboardPayload>
      if (Array.isArray(parsed.ops)) {
        const ops = sanitizeWhiteboardOps(parsed.ops)
        if (ops.length) return { ops, note: safeString(parsed.note, 240) || undefined }
      }
    } catch {
      // ignore malformed Agent output and keep chat usable
    }
  }
  return null
}

export function stripWhiteboardPayload(content: string) {
  return (content || '')
    .replace(/\[WHITEBOARD_OPS\][\s\S]*?\[\/WHITEBOARD_OPS\]/gi, '')
    .replace(/```(?:json)?\s*\{[\s\S]*?"ops"[\s\S]*?\}\s*```/gi, '')
    .trim()
}
