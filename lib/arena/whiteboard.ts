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

function compactText(text: string, max = 62) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function includesAny(challenge: Challenge, words: string[]) {
  const haystack = `${challenge.title} ${challenge.description} ${challenge.tags.join(' ')}`.toLowerCase()
  return words.some((word) => haystack.includes(word.toLowerCase()))
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
    { type: 'text', text: compactText(challenge.description.replace(/AI 面试题 \/ Agent 练习题。/g, '').split('\n').find(Boolean) || challenge.title, 96), x: 80, y: 88, size: 'sm', color: '#64748b' },
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
  return zh
    ? `请作为 AI 面试官和白板讲解老师，围绕「${challenge.title}」进行${stepMode ? '逐步' : '完整'}白板推导。\n\n请先用自然语言讲解，然后必须输出一个白板 JSON 块，格式如下：\n${WHITEBOARD_OPEN}\n{"ops":[{"type":"clear"},{"type":"title","text":"..."},{"type":"box","id":"goal","text":"...","x":80,"y":130,"w":190,"h":86},{"type":"arrow","from":"goal","to":"model","label":"..."},{"type":"section","title":"...","items":["..."],"x":90,"y":310,"w":510}]}\n${WHITEBOARD_CLOSE}\n\n约束：只输出 JSON ops，不要输出 JS；坐标范围 x 60-1250、y 40-720；用 box/arrow/section/text/title 表达答案推导、架构、公示和 trade-off。题目描述：\n${challenge.description}`
    : `Act as an AI interviewer and whiteboard instructor for "${challenge.title}". Produce a ${stepMode ? 'step-by-step' : 'complete'} whiteboard derivation.\n\nFirst explain in natural language, then include a whiteboard JSON block exactly like this:\n${WHITEBOARD_OPEN}\n{"ops":[{"type":"clear"},{"type":"title","text":"..."},{"type":"box","id":"goal","text":"...","x":80,"y":130,"w":190,"h":86},{"type":"arrow","from":"goal","to":"model","label":"..."},{"type":"section","title":"...","items":["..."],"x":90,"y":310,"w":510}]}\n${WHITEBOARD_CLOSE}\n\nConstraints: JSON ops only, no JS; coordinates x 60-1250, y 40-720; use box/arrow/section/text/title for derivation, architecture, formulas and trade-offs. Challenge description:\n${challenge.description}`
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
      if (Array.isArray(parsed.ops)) return { ops: parsed.ops.filter(Boolean) as WhiteboardOp[], note: parsed.note }
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
