import type { Challenge } from './types'

export type WhiteboardLocale = 'zh' | 'en'
export type ExcalidrawWhiteboardElement = Record<string, unknown>
export type WhiteboardDiagramStep = { stage?: string; title?: string; markdown?: string; mermaid?: string; source?: string; html?: string; summary?: string[] }
export type WhiteboardDiagram = { format?: string; title?: string; summary?: string[]; source?: string; mermaid?: string; markdown?: string; html?: string; steps?: WhiteboardDiagramStep[] }
export type ExcalidrawWhiteboardPayload = { elements: ExcalidrawWhiteboardElement[]; note?: string; diagram?: WhiteboardDiagram }
type WhiteboardDiagramPayload = WhiteboardDiagram

const DIAGRAM_OPEN = '[WHITEBOARD_DIAGRAM]'
const DIAGRAM_CLOSE = '[/WHITEBOARD_DIAGRAM]'
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

function safeMultilineString(value: unknown, max = 1200) {
  return String(value ?? '')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max)
}

function safeHtmlString(value: unknown, max = 24000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, max)
}

function htmlValueFromRecord(record: Record<string, unknown>) {
  return record.html
    || record.animation_html
    || record.html_animation
    || record.animated_html
    || record.html_board
    || record.svg_html
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json|JSON)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

function extractFirstJsonObject(value: string) {
  const text = stripJsonFence(value)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return text
  return text.slice(start, end + 1)
}

function parseDiagramJsonCandidate(candidate: string) {
  const stripped = stripJsonFence(candidate)
  try {
    return JSON.parse(stripped) as WhiteboardDiagramPayload
  } catch {
    return JSON.parse(extractFirstJsonObject(stripped)) as WhiteboardDiagramPayload
  }
}

function visualLength(text: string) {
  return Array.from(text).reduce((total, char) => total + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0)
}

function wrapLine(line: string, maxVisualLength: number) {
  const chunks: string[] = []
  let current = ''
  let currentLength = 0
  for (const char of Array.from(line)) {
    const charLength = /[\u4e00-\u9fff]/.test(char) ? 2 : 1
    if (current && currentLength + charLength > maxVisualLength) {
      chunks.push(current.trim())
      current = ''
      currentLength = 0
    }
    current += char
    currentLength += charLength
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function wrapText(text: string, maxVisualLength: number, maxLines: number) {
  const lines = safeMultilineString(text)
    .split('\n')
    .flatMap((line) => wrapLine(line, maxVisualLength))
    .filter(Boolean)
  if (lines.length <= maxLines) return lines.join('\n')
  const visible = lines.slice(0, maxLines)
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/\.*$/, '')}...`
  return visible.join('\n')
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
  const byTemplate: Record<NonNullable<Challenge['whiteboard_template']>, string> = {
    system_architecture: zh
      ? '按本题领域画系统架构：只保留必要组件，突出数据边界、关键决策点、反馈来源和生产观测。'
      : 'Draw a domain-specific system architecture: keep only necessary components and highlight data boundaries, key decisions, feedback sources, and production observability.',
    pipeline: zh
      ? '按本题动作链画 pipeline：输入准备、核心处理、资源瓶颈、验证信号和下一轮迭代要相互对应。'
      : 'Draw a problem-specific pipeline: input preparation, core processing, resource bottlenecks, validation signals, and iteration should connect clearly.',
    training_serving_consistency: zh
      ? '画训练侧和服务侧的状态对齐：数据时间点、参数或特征版本、同步路径、校验点和异常处理要落到本题。'
      : 'Draw state alignment between training and serving: data time point, parameter or feature versions, synchronization path, checks, and issue handling must match the problem.',
    inference_flow: zh
      ? '画本题推理路径：张量或请求如何流动、缓存/调度在哪里起作用、瓶颈如何形成、验证数据从哪里来。'
      : 'Draw the problem-specific inference path: how tensors or requests flow, where cache/scheduling matters, how the bottleneck forms, and where validation data comes from.',
    evaluation_loop: zh
      ? '画评测闭环：样本来源、优化信号、人工或自动校准、回归门禁和容易误判的案例要针对本题。'
      : 'Draw the evaluation loop: sample sources, optimization signal, human or automated calibration, regression gate, and misleading cases should be problem-specific.',
    solution_flow: zh
      ? '画解题流程：抽象、关键机制、推理顺序、边界样例和检查方法要来自本题，而不是通用答题框。'
      : 'Draw the solution flow: abstraction, key mechanism, reasoning order, boundary examples, and checks should come from this problem, not a generic answer frame.',
  }
  return byTemplate[template]
}

function textElement(id: string, text: string, x: number, y: number, fontSize = 20, width = 300, color = '#0f172a'): ExcalidrawWhiteboardElement {
  const cleanText = safeMultilineString(text, 900)
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
  const label = wrapText(text, 18, 3)
  return [
    {
      type: 'rectangle',
      id,
      x,
      y,
      width: 230,
      height: 108,
      strokeColor: color,
      backgroundColor: bg,
      fillStyle: 'solid',
      roundness: { type: 3 },
      strokeWidth: 2,
    },
    textElement(`${id}-label`, label, x + 14, y + 18, 18, 202),
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
  const visibleItems = items.slice(0, 4).map((item) => `- ${wrapText(safeString(item, 180), 48, 2)}`)
  const body = [title, '', ...visibleItems].join('\n')
  return [
    {
      type: 'rectangle',
      id,
      x,
      y,
      width: 560,
      height: Math.max(170, 92 + body.split('\n').length * 26),
      strokeColor: color,
      backgroundColor: '#ffffff',
      fillStyle: 'solid',
      roundness: { type: 3 },
      strokeWidth: 2,
    },
    textElement(`${id}-text`, body, x + 18, y + 16, 18, 524),
  ]
}

function colorForIndex(index: number) {
  return [
    { stroke: '#0f766e', bg: '#ccfbf1' },
    { stroke: '#7c3aed', bg: '#ede9fe' },
    { stroke: '#d97706', bg: '#ffedd5' },
    { stroke: '#2563eb', bg: '#dbeafe' },
    { stroke: '#dc2626', bg: '#fee2e2' },
    { stroke: '#475569', bg: '#f1f5f9' },
  ][index % 6]
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

function elementText(element: ExcalidrawWhiteboardElement) {
  return safeMultilineString(element.text ?? (isRecord(element.label) ? element.label.text : '') ?? '', 900)
}

function elementId(element: ExcalidrawWhiteboardElement) {
  return safeString(element.id, 80)
}

function elementType(element: ExcalidrawWhiteboardElement) {
  return safeString(element.type, 32)
}

function elementNumber(element: ExcalidrawWhiteboardElement, key: string, fallback: number) {
  return safeNumber(element[key], fallback, -2000, 2400)
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

function isShapeElement(element: ExcalidrawWhiteboardElement) {
  return ['rectangle', 'ellipse', 'diamond'].includes(elementType(element))
}

function shapeLabel(shape: ExcalidrawWhiteboardElement, byId: Map<string, ExcalidrawWhiteboardElement>) {
  const id = elementId(shape)
  const direct = isRecord(shape.customData) ? safeString(shape.customData.label, 240) : ''
  if (direct) return direct
  return elementText(byId.get(`${id}-label`) || byId.get(`${id}-text`) || {})
}

function isInsideShape(text: ExcalidrawWhiteboardElement, shape: ExcalidrawWhiteboardElement) {
  const textX = elementNumber(text, 'x', 0)
  const textY = elementNumber(text, 'y', 0)
  const shapeX = elementNumber(shape, 'x', 0)
  const shapeY = elementNumber(shape, 'y', 0)
  const shapeW = elementNumber(shape, 'width', 210)
  const shapeH = elementNumber(shape, 'height', 92)
  return textX >= shapeX - 12 && textX <= shapeX + shapeW + 12 && textY >= shapeY - 12 && textY <= shapeY + shapeH + 12
}

function isSectionLike(shape: ExcalidrawWhiteboardElement, label: string, index: number) {
  const id = elementId(shape).toLowerCase()
  const text = label.toLowerCase()
  const width = elementNumber(shape, 'width', 210)
  const height = elementNumber(shape, 'height', 92)
  if (index >= 6) return true
  if (width >= 330 || height >= 125) return true
  return ['section', 'risk', 'trade', 'focus', 'framework', 'note', 'follow', 'eval'].some((word) => id.includes(word) || text.includes(word))
}

function updateTextLayout(element: ExcalidrawWhiteboardElement, x: number, y: number, width: number, fontSize = 20) {
  const text = wrapText(elementText(element), width >= 700 ? 72 : 48, width >= 700 ? 2 : 6)
  return {
    ...element,
    x,
    y,
    text,
    originalText: safeString(element.originalText, 900) || text,
    fontSize,
    fontFamily: DEFAULT_FONT_FAMILY,
    lineHeight: DEFAULT_LINE_HEIGHT,
    width,
    height: Math.max(28, text.split('\n').length * fontSize * DEFAULT_LINE_HEIGHT),
    backgroundColor: 'transparent',
    textAlign: 'left',
    verticalAlign: 'top',
  }
}

function nodeSize(label: string, kind: DiagramKind, section = false) {
  const rawLines = safeMultilineString(label).split('\n').filter(Boolean)
  const longest = rawLines.reduce((max, line) => Math.max(max, visualLength(line)), 0)
  if (section) {
    const width = clamp(longest > 64 ? 610 : longest > 42 ? 540 : 460, 420, 620)
    const wrapped = wrapText(label, width > 560 ? 58 : 48, 8)
    const lineCount = wrapped.split('\n').length
    return { width, height: clamp(78 + lineCount * 25, 128, 260), fontSize: 18, wrapped }
  }
  const wideKind = kind === 'architecture' || kind === 'two_lane'
  const width = clamp(longest > 28 ? 280 : longest > 18 ? 250 : wideKind ? 230 : 220, 210, 300)
  const maxLineLength = width >= 270 ? 24 : 20
  const wrapped = wrapText(label, maxLineLength, 4)
  const lineCount = wrapped.split('\n').length
  const fontSize = lineCount >= 4 ? 17 : 19
  return { width, height: clamp(50 + lineCount * fontSize * DEFAULT_LINE_HEIGHT, 82, 132), fontSize, wrapped }
}

function layoutShapeWithText(shape: ExcalidrawWhiteboardElement, label: string, x: number, y: number, width: number, height: number, textId: string, fontSize = 20, wrappedLabel?: string) {
  const maxLineLength = width >= 420 ? 50 : 22
  const maxLines = width >= 420 ? Math.max(4, Math.floor((height - 36) / (fontSize * DEFAULT_LINE_HEIGHT))) : Math.max(2, Math.floor((height - 26) / (fontSize * DEFAULT_LINE_HEIGHT)))
  const text = wrappedLabel || wrapText(label, maxLineLength, maxLines)
  const normalizedShape = {
    ...shape,
    x,
    y,
    width,
    height,
    strokeColor: safeColor(shape.strokeColor, '#334155'),
    backgroundColor: safeColor(shape.backgroundColor, '#ffffff'),
    customData: undefined,
  }
  return [
    normalizedShape,
    textElement(textId, text, x + 14, y + 16, fontSize, width - 28),
  ]
}

type DiagramKind = 'pipeline' | 'architecture' | 'two_lane' | 'debug' | 'concept'

function inferDiagramKind(labels: string[]): DiagramKind {
  const text = labels.join(' ').toLowerCase()
  if (/(debug|bug|error|fail|fix|修复|错误|失败|问题|定位)/.test(text)) return 'debug'
  if (/(offline|online|training|serving|feature|backfill|point-in-time|pit|离线|在线|训练|特征|回填|一致性)/.test(text)) return 'two_lane'
  if (/(concept|why|principle|formula|invariant|知识点|原理|公式|不变量|复杂度)/.test(text)) return 'concept'
  if (/(pipeline|flow|retrieve|rerank|generate|chunk|embed|prefill|decode|kv|cache|流程|链路|召回|重排|生成|缓存)/.test(text)) return 'pipeline'
  return 'architecture'
}

function nodeIdFromText(text: string, fallback: string) {
  const normalized = safeString(text, 64).toLowerCase()
  if (/(retrieve|retrieval|召回|搜索)/.test(normalized)) return 'retrieval'
  if (/(rerank|rank|排序|重排)/.test(normalized)) return 'rerank'
  if (/(generate|生成|llm|model|模型)/.test(normalized)) return 'model'
  if (/(cache|kv|缓存)/.test(normalized)) return 'cache'
  if (/(feature|特征|offline|离线)/.test(normalized)) return 'features'
  if (/(serve|online|服务|在线)/.test(normalized)) return 'serving'
  if (/(metric|eval|monitor|指标|评测|监控)/.test(normalized)) return 'metrics'
  if (/(risk|trade|fail|风险|权衡|失败)/.test(normalized)) return 'risks'
  if (/(fix|debug|修复|定位)/.test(normalized)) return 'fix'
  return safeId(normalized, fallback)
}

function cleanMermaidLabel(label: string) {
  return safeMultilineString(label, 180)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMermaidNode(token: string) {
  const trimmed = token.trim().replace(/;$/, '').replace(/^[&\s]+|[&\s]+$/g, '')
  const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*(?:\[\[([\s\S]+?)\]\]|\[([\s\S]+?)\]|\(([\s\S]+?)\)|\{([\s\S]+?)\})?$/)
  if (!match) return null
  const id = safeId(match[1], `node-${Math.random().toString(36).slice(2, 7)}`)
  const label = cleanMermaidLabel(match[2] || match[3] || match[4] || match[5] || match[1])
  const shape = match[5] ? 'diamond' : 'rectangle'
  return { id, label, shape }
}

function diagramPayloadToElements(payload: WhiteboardDiagramPayload): ExcalidrawWhiteboardElement[] {
  const firstStep = Array.isArray(payload.steps) ? payload.steps.find((step) => step.mermaid || step.source) : undefined
  const source = safeMultilineString(payload.source || payload.mermaid || firstStep?.mermaid || firstStep?.source || '', 5000)
  const title = safeString(payload.title, 160) || 'Whiteboard diagram'
  const summary = Array.isArray(payload.summary) ? payload.summary.map((item) => safeString(item, 180)).filter(Boolean).slice(0, 4) : []
  if (!source) return []

  const nodes = new Map<string, { id: string; label: string; shape: string }>()
  const edgeRegex = /(.+?)\s*(?:-->|---|==>|-.->)\s*(?:\|[^|]*\|\s*)?(.+)/
  source.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt)\b/i.test(trimmed)) return
    const edge = trimmed.match(edgeRegex)
    if (edge) {
      ;[edge[1], edge[2]].forEach((token) => {
        const parsed = parseMermaidNode(token)
        if (parsed && !nodes.has(parsed.id)) nodes.set(parsed.id, parsed)
      })
      return
    }
    const parsed = parseMermaidNode(trimmed)
    if (parsed && !nodes.has(parsed.id)) nodes.set(parsed.id, parsed)
  })

  const nodeList = Array.from(nodes.values()).slice(0, 8)
  if (!nodeList.length) return []
  const elements: ExcalidrawWhiteboardElement[] = [
    textElement('title', title, 70, 45, 34, 920),
    textElement('subtitle', summary[0] || 'Generated from Agent diagram spec', 80, 92, 18, 760, '#64748b'),
    ...nodeList.map((node, index) => ({
      type: node.shape,
      id: node.id,
      x: 80 + index * 260,
      y: 145,
      width: 230,
      height: 108,
      strokeColor: colorForIndex(index).stroke,
      backgroundColor: colorForIndex(index).bg,
      fillStyle: 'solid',
      roundness: { type: 3 },
      customData: { label: node.label },
    })),
  ]
  if (summary.length > 1) {
    elements.push({
      type: 'rectangle',
      id: 'summary-section',
      x: 90,
      y: 390,
      width: 560,
      height: 180,
      strokeColor: '#475569',
      backgroundColor: '#ffffff',
      fillStyle: 'solid',
      roundness: { type: 3 },
      customData: { label: summary.join('\n') },
    })
  }
  return normalizeWhiteboardLayout(elements)
}

function sanitizeDiagramPayload(payload: WhiteboardDiagramPayload): WhiteboardDiagram {
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((step, index) => ({
      stage: safeString(step.stage, 80) || `step-${index + 1}`,
      title: safeString(step.title, 160) || `Step ${index + 1}`,
      markdown: safeMultilineString(step.markdown, 6500),
      mermaid: safeMultilineString(step.mermaid || step.source, 5000),
      html: safeHtmlString(htmlValueFromRecord(step as Record<string, unknown>), 14000),
      summary: Array.isArray(step.summary) ? step.summary.map((item) => safeString(item, 180)).filter(Boolean).slice(0, 4) : undefined,
    })).filter((step) => step.markdown || step.mermaid || step.html).slice(0, 6)
    : undefined
  const payloadRecord = payload as Record<string, unknown>
  return {
    format: safeString(payload.format, 40) || 'mermaid',
    title: safeString(payload.title, 160),
    summary: Array.isArray(payload.summary) ? payload.summary.map((item) => safeString(item, 180)).filter(Boolean).slice(0, 5) : undefined,
    source: safeMultilineString(payload.source || payload.mermaid, 5000),
    mermaid: safeMultilineString(payload.mermaid || payload.source, 5000),
    markdown: safeMultilineString(payload.markdown, 6500),
    html: safeHtmlString(htmlValueFromRecord(payloadRecord), 26000),
    steps,
  }
}

function arrowBetween(id: string, from: { x: number; y: number }, to: { x: number; y: number }, width = 230, height = 108) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const startX = dx >= 0 ? from.x + width : from.x
    const endX = dx >= 0 ? to.x : to.x + width
    return arrowElement(id, startX, from.y + height / 2, endX - startX, to.y + height / 2 - (from.y + height / 2))
  }
  const startY = dy >= 0 ? from.y + height : from.y
  const endY = dy >= 0 ? to.y : to.y + height
  return arrowElement(id, from.x + width / 2, startY, to.x + width / 2 - (from.x + width / 2), endY - startY)
}

function slotsForNodes(kind: DiagramKind, sizes: Array<{ width: number; height: number }>) {
  const count = sizes.length
  if (kind === 'debug') {
    return [
      { x: 90, y: 145 },
      { x: 360, y: 145 },
      { x: 630, y: 145 },
      { x: 900, y: 145 },
      { x: 630, y: 300 },
      { x: 360, y: 300 },
    ].slice(0, count)
  }
  if (kind === 'two_lane') {
    const top = Math.ceil(count / 2)
    return sizes.map((_, index) => ({
      x: 90 + (index % top) * 300,
      y: index < top ? 145 : 315,
    }))
  }
  if (kind === 'concept') {
    return [
      { x: 555, y: 145 },
      { x: 185, y: 145 },
      { x: 925, y: 145 },
      { x: 185, y: 320 },
      { x: 555, y: 320 },
      { x: 925, y: 320 },
    ].slice(0, count)
  }
  if (kind === 'architecture') {
    return [
      { x: 555, y: 230 },
      { x: 135, y: 145 },
      { x: 135, y: 335 },
      { x: 930, y: 145 },
      { x: 930, y: 335 },
      { x: 555, y: 405 },
    ].slice(0, count)
  }
  return sizes.map((_, index) => ({
    x: 80 + (index % 4) * 310,
    y: index < 4 ? 145 : 310,
  }))
}

function addDiagramArrows(kind: DiagramKind, laidOut: ExcalidrawWhiteboardElement[], boxes: Array<{ shape: ExcalidrawWhiteboardElement; label: string }>, slots: Array<{ x: number; y: number }>, sizes: Array<{ width: number; height: number }>) {
  if (boxes.length < 2) return
  const add = (fromIndex: number, toIndex: number) => {
    const from = slots[fromIndex]
    const to = slots[toIndex]
    if (!from || !to) return
    laidOut.push(arrowBetween(
      `${elementId(boxes[fromIndex].shape) || `box-${fromIndex}`}-${elementId(boxes[toIndex].shape) || `box-${toIndex}`}-arrow`,
      from,
      to,
      sizes[fromIndex].width,
      sizes[fromIndex].height,
    ))
  }
  if (kind === 'architecture') {
    for (let index = 1; index < boxes.length; index += 1) add(index, 0)
    return
  }
  if (kind === 'concept') {
    for (let index = 1; index < boxes.length; index += 1) add(0, index)
    return
  }
  if (kind === 'two_lane') {
    const top = Math.ceil(boxes.length / 2)
    for (let index = 0; index < top - 1; index += 1) add(index, index + 1)
    for (let index = top; index < boxes.length - 1; index += 1) add(index, index + 1)
    for (let index = 0; index < Math.min(top, boxes.length - top); index += 1) add(index, top + index)
    return
  }
  boxes.slice(0, 5).forEach((_, index) => {
    if (index < boxes.length - 1) add(index, index + 1)
  })
}

function normalizeWhiteboardLayout(elements: ExcalidrawWhiteboardElement[]) {
  const byId = new Map(elements.map((element) => [elementId(element), element]).filter(([id]) => Boolean(id)) as Array<[string, ExcalidrawWhiteboardElement]>)
  const consumedTextIds = new Set<string>()
  const title = elements.find((element) => elementId(element) === 'title' && elementType(element) === 'text')
    || elements.find((element) => elementType(element) === 'text' && elementNumber(element, 'fontSize', 20) >= 28)
  const subtitle = elements.find((element) => elementId(element) === 'subtitle' && elementType(element) === 'text')

  if (title) consumedTextIds.add(elementId(title))
  if (subtitle) consumedTextIds.add(elementId(subtitle))

  const shapes = elements.filter(isShapeElement)
  const groupedShapes = shapes.map((shape) => {
    const id = elementId(shape)
    let label = shapeLabel(shape, byId)
    let labelElement = byId.get(`${id}-label`) || byId.get(`${id}-text`)
    if (labelElement) consumedTextIds.add(elementId(labelElement))
    if (!label) {
      const contained = elements.find((element) => elementType(element) === 'text' && !consumedTextIds.has(elementId(element)) && isInsideShape(element, shape))
      if (contained) {
        labelElement = contained
        label = elementText(contained)
        consumedTextIds.add(elementId(contained))
      }
    }
    return { shape, label: label || id || 'Node', labelElement }
  })

  const boxes = groupedShapes.filter((entry, index) => !isSectionLike(entry.shape, entry.label, index)).slice(0, 6)
  const sections = groupedShapes.filter((entry, index) => isSectionLike(entry.shape, entry.label, index)).slice(0, 3)
  const diagramKind = inferDiagramKind([...boxes, ...sections].map((entry) => `${elementId(entry.shape)} ${entry.label}`))
  const notes = elements
    .filter((element) => elementType(element) === 'text' && !consumedTextIds.has(elementId(element)))
    .map(elementText)
    .filter(Boolean)
    .slice(0, 4)

  const laidOut: ExcalidrawWhiteboardElement[] = []
  if (title) laidOut.push(updateTextLayout(title, 70, 45, 960, 34))
  if (subtitle) laidOut.push(updateTextLayout(subtitle, 80, 92, 760, 18))

  const boxSizes = boxes.map((entry) => nodeSize(entry.label, diagramKind))
  const boxSlots = slotsForNodes(diagramKind, boxSizes)
  boxes.forEach((entry, index) => {
    const slot = boxSlots[index] || boxSlots[boxSlots.length - 1]
    const id = elementId(entry.shape) || `box-${index}`
    const size = boxSizes[index]
    const color = colorForIndex(index)
    const shape = {
      ...entry.shape,
      strokeColor: safeColor(entry.shape.strokeColor, color.stroke),
      backgroundColor: safeColor(entry.shape.backgroundColor, color.bg),
      type: diagramKind === 'concept' && index === 0 ? 'diamond' : entry.shape.type,
    }
    laidOut.push(...layoutShapeWithText(shape, entry.label, slot.x, slot.y, size.width, size.height, `${id}-label`, size.fontSize, size.wrapped))
  })

  addDiagramArrows(diagramKind, laidOut, boxes, boxSlots, boxSizes)

  const sectionY = diagramKind === 'pipeline' ? 335 : 455
  const sectionSlots = [
    { x: 90, y: sectionY },
    { x: 700, y: sectionY },
    { x: 90, y: sectionY + 230 },
  ]
  sections.forEach((entry, index) => {
    const slot = sectionSlots[index] || sectionSlots[sectionSlots.length - 1]
    const id = elementId(entry.shape) || `section-${index}`
    const text = entry.label.split(/[\n;；]/).map((item) => item.trim()).filter(Boolean).slice(0, 5).join('\n')
    const size = nodeSize(text, diagramKind, true)
    laidOut.push(...layoutShapeWithText(entry.shape, text, slot.x, slot.y, size.width, size.height, `${id}-text`, size.fontSize, size.wrapped))
  })

  if (notes.length) {
    const slot = sectionSlots[Math.min(sections.length, sectionSlots.length - 1)]
    laidOut.push(...sectionElements('notes', '补充要点', notes, slot.x, slot.y, '#64748b'))
  }

  if (!laidOut.some(isShapeElement) && elements.length) return elements
  return laidOut.slice(0, MAX_ELEMENTS)
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
  return normalizeWhiteboardLayout(sanitized.slice(0, MAX_ELEMENTS))
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
  const diagramKind = inferDiagramKind([answer, challenge.title, challenge.tags.join(' ')])
  const nodeItems = focusItems.slice(0, 5)
  const rawElements: ExcalidrawWhiteboardElement[] = [
    textElement('title', zh ? `本轮白板摘要：${challenge.title}` : `Board summary: ${challenge.title}`, 70, 45, 34, 920),
    textElement('subtitle', zh ? `根据本轮回答提取 · ${diagramKind}` : `Extracted from this answer · ${diagramKind}`, 80, 92, 18, 760, '#64748b'),
    ...nodeItems.map((item, index) => ({
      type: index === 0 && diagramKind === 'concept' ? 'diamond' : 'rectangle',
      id: nodeIdFromText(item, `answer-node-${index}`),
      x: 80 + index * 260,
      y: 145,
      width: 230,
      height: 108,
      strokeColor: colorForIndex(index).stroke,
      backgroundColor: colorForIndex(index).bg,
      fillStyle: 'solid',
      roundness: { type: 3 },
      customData: { label: item },
    })),
    {
      type: 'rectangle',
      id: 'followup-section',
      x: 90,
      y: 390,
      width: 520,
      height: 180,
      strokeColor: '#7c3aed',
      backgroundColor: '#ffffff',
      fillStyle: 'solid',
      roundness: { type: 3 },
      customData: {
        label: [
          zh ? '追问 / 风险' : 'Follow-ups / risks',
          zh ? '瓶颈在哪里，如何量化？' : 'Where is the bottleneck and how is it measured?',
          zh ? '上线后如何监控、回滚和迭代？' : 'How is it monitored, rolled back, and iterated after launch?',
        ].join('\n'),
      },
    },
  ]

  return normalizeWhiteboardLayout(rawElements)
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
    ? 'Markdown/Mermaid 白板必须按四步组织：1) Socratic 提问/诊断，2) 架构或概念分析，3) 按题目拆解关键要点，4) 完整答案结构。第一步也必须包含一个紧凑的局部诊断/流程 Mermaid 图。HTML 白板不要使用这四段结构。'
    : 'The Markdown/Mermaid board must use four steps: 1) Socratic question/diagnosis, 2) architecture or concept analysis, 3) problem-specific key decomposition, 4) complete answer structure. The first step must also include a compact local diagnosis/flow Mermaid diagram. The HTML board must not use these four sections.'
  const visualHtmlRequirements = zh
    ? 'HTML 视觉质量硬性要求：主 SVG 必须是大图，不是缩略图；viewBox 建议至少 1200x560，svg 宽度 100%，图内节点字号 18-28px，公式字号 20-30px，主图高度不少于 420px。必须包含清晰标题、核心图解、公式说明、简单示例、动画说明、结论/检查清单六类内容，但不要使用 Markdown 的四段标题。图必须配文字说明：每个关键节点或公式旁边要有 1-2 句解释，说明“它代表什么、为什么这样变、边界条件是什么”。公式必须逐项解释符号、单位/含义、适用条件，并给一个最小数字或业务例子代入。动画必须真实存在：使用 @keyframes、animation-delay、stroke-dasharray/stroke-dashoffset 或 transform/opacity，让路径、节点或公式按步骤出现；同时提供“如何读这个动画”的文字说明。整体不能只有图，文字解释不少于 6 个说明块。'
    : 'HTML visual quality requirements: the main SVG must be large, not a thumbnail; use a viewBox of at least about 1200x560, svg width 100%, node font size 18-28px, formula font size 20-30px, and main diagram height at least 420px. Include six content types: clear title, core diagram, formula explanation, simple example, animation explanation, and conclusion/checklist, but do not use the four Markdown step headings. Every key node or formula needs 1-2 adjacent explanatory sentences explaining what it means, why the transformation is valid, and its boundary conditions. Explain every formula symbol, unit/meaning, applicability, and include one minimal numeric or business example. Animation must be real: use @keyframes, animation-delay, stroke-dasharray/stroke-dashoffset, or transform/opacity so paths, nodes, or formulas appear step by step; also include text explaining how to read the animation. The page cannot be diagram-only; include at least 6 explanatory text blocks.'
  const limits = zh
    ? `必须同时输出两种白板产物：A) markdown/mermaid 图文白板，B) html 动画白板。Markdown 负责四步讲解；HTML 是另一套面向视觉理解的产物，必须先阅读你本轮 Arena Chat 自然语言回答，抽取其中真正需要可视化的公式、原理、方法、流程、架构、状态变化、变量关系、复杂度/指标和 trade-off，然后重新设计为一张详细的 SVG/HTML 动画讲解页。HTML 禁止使用“Socratic/架构和概念/问题分解/完整答案”四段标题，禁止照搬 markdown steps，禁止通用模板、占位文字或“Known/Relation/Transform”套话。HTML 必须至少包含：1) 一个本题专属 SVG 主图，表达公式推导、变量流、状态流、控制流、数据流或组件依赖；2) 一个符号/组件/指标定义表；3) 一个过程动画，用 CSS keyframes 高亮从输入到中间状态再到结论的路径；4) 一个最后静止可读的总结图或矩阵。${visualHtmlRequirements} 顶层必须有 mermaid 总图，顶层必须有 html 字段；steps[0] 必须有局部诊断/流程 mermaid，architecture_concepts 步要给局部架构图，decomposition 或 complete_answer 步要给局部流程图。每一步的 markdown 必须包含 2-4 句解释文字、必要公式/指标定义、一个紧凑表格或要点列表。所有原理性解释都必须这样处理，不只限于 LLM：数学公式、物理过程、算法机制、操作系统/网络/编译器/数据库、硬件/芯片/电路、AI 模型、工程架构都要给“公式或不变量 + 总图 + 必要局部架构/流程图 + 每步解释”。html 字段必须是一段可独立嵌入的 HTML 片段，使用内联 <style>、CSS keyframes、SVG、div/span/table，不要使用 JavaScript、script、iframe、外链资源、网络图片或表单。顶层 Mermaid 控制在 5-8 个节点、4-7 条边；局部 Mermaid 控制在 3-6 个节点、2-5 条边；HTML 控制在 4500-30000 字符内。`
    : `Output two whiteboard artifacts at the same time: A) markdown/mermaid board, B) animated HTML board. Markdown owns the four-step explanation. HTML is a separate visual artifact: read your Arena Chat natural-language answer, extract the formulas, principles, methods, flows, architecture, state transitions, variable relations, complexity/metrics, and trade-offs that genuinely need visualization, then redesign them as one detailed SVG/HTML animated explanation page. The HTML must not use "Socratic / architecture and concepts / decomposition / complete answer" sections, must not copy markdown steps, and must not use generic templates, placeholders, or "Known/Relation/Transform" boilerplate. HTML must include at least: 1) one problem-specific SVG main diagram showing derivation, variable flow, state flow, control flow, data flow, or component dependencies; 2) one symbol/component/metric definition table; 3) one CSS keyframes process animation highlighting the path from input to intermediate state to conclusion; 4) one final static readable summary diagram or matrix. ${visualHtmlRequirements} Include a top-level mermaid overview and a top-level html field; steps[0] must include a local diagnosis/flow Mermaid diagram, architecture_concepts should include a local architecture diagram, and decomposition or complete_answer should include a local flow diagram. Each step markdown must include 2-4 explanatory sentences, required formulas/metric definitions, and one compact table or bullet list. Apply this to every principle explanation, not only LLMs. The html field must be a self-contained embeddable HTML fragment using inline <style>, CSS keyframes, SVG, div/span/table. Do not use JavaScript, script, iframe, external resources, network images, or forms. Keep top-level Mermaid to 5-8 nodes and 4-7 edges; local Mermaid to 3-6 nodes and 2-5 edges; HTML to 4500-30000 characters.`
  const example = JSON.stringify({
    format: 'steps',
    title: '答案白板',
    summary: ['白板先展示一张最终总图，再按步骤解释公式、指标和取舍。'],
    mermaid: 'flowchart LR\n  Goal["goal / known state"] --> Model["core relation"]\n  Model --> Transform["transform / mechanism"]\n  Transform --> State["intermediate state"]\n  State --> Check{"boundary check"}\n  Check --> Answer["final answer / metric"]\n  classDef input fill:#dbeafe,stroke:#2563eb,color:#0f172a;\n  classDef core fill:#ede9fe,stroke:#7c3aed,color:#2e1065;\n  classDef state fill:#fef3c7,stroke:#d97706,color:#451a03;\n  classDef metric fill:#dcfce7,stroke:#16a34a,color:#052e16;\n  class Goal input;\n  class Model,Transform core;\n  class State,Check state;\n  class Answer metric;',
    html: '<style>.wb{font-family:Inter,system-ui,sans-serif;padding:28px}.hero-svg{width:100%;min-height:430px}.visual-node{animation:trace .9s both}.path{stroke-dasharray:900;stroke-dashoffset:900;animation:draw 1.4s both}@keyframes trace{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes draw{to{stroke-dashoffset:0}}</style><section class="wb" data-html-board="answer-specific"><h2>本题专属 HTML 标题</h2><p class="explain">用文字说明这张图如何读，以及图中每个关键节点代表什么。</p><svg class="hero-svg" viewBox="0 0 1200 560" role="img" aria-label="本题专属大尺寸 SVG 主图"><!-- 必须绘制本轮回答里的具体公式/变量流/流程/架构，不要复制此示例布局 --></svg><section><h3>公式说明</h3><p>解释每个符号、适用条件和边界。</p></section><section><h3>简单示例</h3><p>给一个最小数字或业务例子代入。</p></section><section><h3>动画说明</h3><p>说明动画从哪里开始、依次高亮什么、最后如何读结论。</p></section><table><tr><th>符号/组件/指标</th><th>含义</th><th>在本轮回答中的作用</th></tr></table></section>',
    steps: [
      {
        stage: 'socratic',
        title: '1. Socratic 提问',
        markdown: '先确认候选人的判断入口：这题的核心风险不是“能不能拼出链路”，而是能不能定位质量瓶颈并说明如何验证。\n\n| Focus | Question |\n| --- | --- |\n| Quality bottleneck | Which stage most limits answer correctness? |\n| Evidence | What signal would prove it? |',
        mermaid: 'flowchart TD\n  Question["诊断问题"] --> Signal["关键证据"]\n  Signal --> Next["下一步验证"]',
      },
      {
        stage: 'architecture_concepts',
        title: '2. 架构 / 概念分析',
        markdown: '原理题要把结构和公式对齐：先画状态/数据如何变化，再解释每条边代表的公式变形或机制动作。公式推导至少要定义符号、说明适用条件，并标出边界检查。\n\n$$y=f(x,\\theta),\\quad \\Delta y \\approx \\frac{\\partial f}{\\partial x}\\Delta x$$\n\n| Element | Meaning |\n| --- | --- |\n| Known state | Inputs, constraints, assumptions |\n| Transform | Formula step, mechanism, or state transition |',
        mermaid: 'flowchart LR\n  Known["known state"] --> Relation["core relation"]\n  Relation --> Transform["transform"]\n  Transform --> Intermediate["intermediate state"]\n  Intermediate --> Boundary{"boundary"}\n  classDef input fill:#dbeafe,stroke:#2563eb,color:#0f172a;\n  classDef core fill:#ede9fe,stroke:#7c3aed,color:#2e1065;\n  classDef state fill:#fef3c7,stroke:#d97706,color:#451a03;\n  class Known input;\n  class Relation,Transform core;\n  class Intermediate,Boundary state;',
      },
      {
        stage: 'decomposition',
        title: '3. 题目要点拆解',
        markdown: '拆解时要把“正确性、安全性、可观测性”分开讲，这样追问时能快速落到具体指标。评测不要只说 accuracy，RAG 场景至少要看召回和忠实度。\n\n| Key point | Check |\n| --- | --- |\n| Permissions | Filter before generation |\n| Metrics | Track recall and faithfulness |',
        mermaid: 'flowchart TD\n  Input["input"] --> Gate["constraint / permission gate"]\n  Gate --> Core["core processing"]\n  Core --> Check{"quality check"}\n  Check --> Output["answer / metric"]\n  classDef input fill:#dbeafe,stroke:#2563eb,color:#0f172a;\n  classDef core fill:#ede9fe,stroke:#7c3aed,color:#2e1065;\n  classDef risk fill:#fef3c7,stroke:#d97706,color:#451a03;\n  classDef metric fill:#dcfce7,stroke:#16a34a,color:#052e16;\n  class Input input;\n  class Gate,Core core;\n  class Check risk;\n  class Output metric;',
      },
      {
        stage: 'complete_answer',
        title: '4. 完整答案',
        markdown: '完整答案应收束到 baseline、trade-off、指标和上线风险。容量或延迟类题要给量化口径，例如端到端延迟可以按关键路径累加：\n\n$$T_{e2e}=T_{retrieve}+T_{rerank}+T_{generate}+T_{network}$$\n\n| Section | Must cover |\n| --- | --- |\n| Baseline | End-to-end path |\n| Trade-off | Latency vs quality |',
      },
    ],
  })
  return zh
    ? `请作为 AI 面试官和白板讲解老师，围绕「${challenge.title}」进行${stepMode ? '逐步' : '完整'}答案白板推导。\n\n${focus}\n${phases}\n${limits}\n${constraints}\n\n请先用自然语言讲解本轮回答，然后必须输出一个白板图协议块。白板协议支持 Markdown 段落、表格、LaTeX 公式、Mermaid 和自包含 HTML/CSS 动画，前端会直接渲染，不需要转成 Excalidraw 线框。格式如下，示例只说明字段，不允许复制示例内容或布局：\n${DIAGRAM_OPEN}\n${example}\n${DIAGRAM_CLOSE}\n\n硬性要求：必须有顶层 mermaid 总图；必须有顶层 html 动画；steps[0].mermaid 必须是局部诊断/流程图；architecture_concepts 步必须有局部架构图；decomposition 或 complete_answer 步必须有局部流程图；四个 steps 都要有；每步的 markdown 至少包含解释文字和必要公式/指标定义，不能只有表格；每步 markdown 必须总结本轮回答；html 必须从你刚刚的 Arena Chat 回答中抽取公式、原理、方法、流程和架构重新设计为详细 SVG/HTML 动画，不能按四步结构组织，不能照抄示例，不能输出模板占位，不能只画通用步骤；不要画题目原文；不要输出 WHITEBOARD_OPS。`
    : `Act as an AI interviewer and whiteboard instructor for "${challenge.title}". Produce a ${stepMode ? 'step-by-step' : 'complete'} answer whiteboard derivation.\n\n${focus}\n${phases}\n${limits}\n${constraints}\n\nFirst explain this reply in natural language, then include one whiteboard diagram protocol block. The protocol supports Markdown paragraphs, tables, LaTeX formulas, Mermaid, and self-contained HTML/CSS animation, and the frontend renders them directly instead of converting them into Excalidraw wire boxes. Use this exact format; the example only documents fields and must not be copied as content or layout:\n${DIAGRAM_OPEN}\n${example}\n${DIAGRAM_CLOSE}\n\nHard requirements: include a top-level mermaid overview; include a top-level html animation; steps[0].mermaid must be a local diagnosis/flow diagram; architecture_concepts must include a local architecture diagram; decomposition or complete_answer must include a local flow diagram; include all four steps; each step markdown must include explanatory prose and required formulas/metric definitions, not just a table; each step markdown must summarize this reply; html must extract formulas, principles, methods, flows, and architecture from your Arena Chat answer and redesign them as detailed SVG/HTML animation; do not organize HTML by the four markdown steps, copy the example, output placeholders, or draw only generic stages; do not draw prompt text; do not output WHITEBOARD_OPS.`
}

export function makeWhiteboardFromAnswerPrompt(challenge: Challenge, locale: WhiteboardLocale, answer: string, userMessage = '') {
  const zh = locale === 'zh'
  const template = challenge.whiteboard_template || 'solution_flow'
  const concepts = conceptSummary(challenge)
  const blueprint = whiteboardBlueprint(template, zh)
  const cleanAnswer = safeMultilineString(answer, 12000)
  const cleanUserMessage = safeMultilineString(userMessage, 2400)
  const cleanDescription = safeMultilineString(challenge.description.replace(/<[^>]+>/g, ' '), 3000)
  const visualRequirements = zh
    ? 'HTML 视觉要求：主 SVG 必须是大尺寸图，viewBox 至少约 1200x560，宽度 100%，主图高度不少于 420px；图内节点字号 18-28px，公式字号 20-30px。页面必须包含：清晰标题、核心大图、每个节点的文字说明、公式逐项说明、一个简单示例、动画说明、结论/检查清单。动画必须真实存在，用 @keyframes、animation-delay、stroke-dasharray/stroke-dashoffset 或 transform/opacity 让路径/节点/公式按步骤出现；不能只有静态图。文字解释不能少于 6 个说明块，每个关键公式都要解释符号、含义、适用条件和边界，并给一个最小数字或业务例子代入。'
    : 'HTML visual requirements: the main SVG must be large, with a viewBox of at least about 1200x560, width 100%, and main diagram height at least 420px; use 18-28px node text and 20-30px formula text. The page must include: clear title, large core diagram, text explanation for every key node, formula-by-formula explanation, one simple example, animation explanation, and conclusion/checklist. Animation must be real: use @keyframes, animation-delay, stroke-dasharray/stroke-dashoffset, or transform/opacity so paths/nodes/formulas appear step by step; do not output a static-only diagram. Include at least 6 explanatory text blocks. For every key formula, explain symbols, meaning, applicability, boundary conditions, and include one minimal numeric or business example.'
  const schema = JSON.stringify({
    format: 'steps',
    title: zh ? '基于回答的原理白板' : 'Principle board from answer',
    summary: [zh ? '从 Arena Chat 回答抽取核心公式、流程、架构和方法。' : 'Extract formulas, flows, architecture, and methods from the Arena Chat answer.'],
    mermaid: 'flowchart LR\n  Input["answer focus"] --> Mechanism["core mechanism"]\n  Mechanism --> Flow["state / data flow"]\n  Flow --> Check{"boundary / metric"}\n  Check --> Result["conclusion"]',
    html: '<style>.wb{font-family:Inter,system-ui,sans-serif;padding:28px}.hero-svg{width:100%;min-height:430px}.node{animation:pop .7s both}.edge{stroke-dasharray:900;stroke-dashoffset:900;animation:draw 1.3s both}@keyframes pop{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes draw{to{stroke-dashoffset:0}}</style><section class="wb" data-html-board="answer-specific"><h2>本题专属 HTML 标题</h2><p class="explain">说明这张动画图如何读。</p><svg class="hero-svg" viewBox="0 0 1200 560" role="img" aria-label="本题专属大尺寸 SVG 主图"></svg><section><h3>公式说明</h3><p>解释符号、含义、适用条件和边界。</p></section><section><h3>简单示例</h3><p>给出最小数字或业务例子代入。</p></section><section><h3>动画说明</h3><p>说明动画依次高亮什么。</p></section><table><tr><th>符号/组件/指标</th><th>含义</th><th>作用</th></tr></table></section>',
    steps: [
      { stage: 'socratic', title: '1. Socratic 提问/诊断', markdown: '...', mermaid: 'flowchart TD\n  Question --> Signal\n  Signal --> Next' },
      { stage: 'architecture_concepts', title: '2. 架构或概念分析', markdown: '...', mermaid: 'flowchart LR\n  A --> B' },
      { stage: 'decomposition', title: '3. 关键要点拆解', markdown: '...', mermaid: 'flowchart TD\n  A --> B' },
      { stage: 'complete_answer', title: '4. 完整答案结构', markdown: '...' },
    ],
  })

  return zh
    ? `[whiteboard_render_request:auto]\nchat_mode: whiteboard_auto\n不要回答用户新问题，不要寒暄，不要输出普通解释文字。你的任务是基于上一条 Arena Chat 回答补齐或重生成 WHITEBOARD_DIAGRAM 协议块，并且只输出一个 WHITEBOARD_DIAGRAM 协议块。\n\n题目：${challenge.title}\n模板：${template}\n知识点：${concepts}\n白板方向：${blueprint}\n题目背景只用于理解，不要照抄：${cleanDescription}\n${cleanUserMessage ? `用户原始问题/输入：\n${cleanUserMessage}\n\n` : ''}Arena Chat 回答如下，HTML 必须以它为唯一主要来源：\n${cleanAnswer}\n\n生成要求：\n1. Markdown/Mermaid 仍按四步组织：Socratic 提问/诊断、架构或概念分析、关键要点拆解、完整答案结构；第一步必须有 steps[0].mermaid 局部诊断/流程图。\n2. HTML 与 Markdown 是两套不同产物。HTML 不要使用这四个标题，不要照搬 steps，不要复述文字。\n3. HTML 必须对回答中的公式、原理、方法、流程、架构、变量流、状态流、控制流、数据流、组件依赖、边界条件、指标变化和 trade-off 重新分析，并绘制成详细 SVG/HTML 讲解页。\n4. ${visualRequirements}\n5. HTML 至少包含：本题专属 SVG 主图、符号/组件/指标定义表、CSS keyframes 过程动画、公式说明、简单示例、动画说明、最终静止可读的总结图或矩阵。\n6. 不允许通用模板、占位文字、script、JavaScript、iframe、外链资源、网络图片或表单。\n7. 顶层必须有 mermaid，顶层必须有 html，总 HTML 4500-30000 字符。输出格式只能是：\n${DIAGRAM_OPEN}\n${schema}\n${DIAGRAM_CLOSE}`
    : `[whiteboard_render_request:auto]\nchat_mode: whiteboard_auto\nDo not answer a new user question, do not add pleasantries, and do not output normal explanatory prose. Your job is to complete or regenerate one WHITEBOARD_DIAGRAM protocol block from the previous Arena Chat answer. Output only one WHITEBOARD_DIAGRAM protocol block.\n\nChallenge: ${challenge.title}\nTemplate: ${template}\nConcepts: ${concepts}\nBoard direction: ${blueprint}\nProblem background is only grounding; do not copy it: ${cleanDescription}\n${cleanUserMessage ? `Original user message:\n${cleanUserMessage}\n\n` : ''}Arena Chat answer, which must be the primary source for the HTML:\n${cleanAnswer}\n\nRequirements:\n1. Markdown/Mermaid still uses four steps: Socratic diagnosis, architecture/concepts, key decomposition, complete answer structure; the first step must include steps[0].mermaid as a local diagnosis/flow diagram.\n2. HTML is a separate artifact. Do not use those four headings, do not copy steps, and do not restate text.\n3. HTML must re-analyze formulas, principles, methods, flows, architecture, variable flow, state flow, control flow, data flow, component dependencies, boundary conditions, metric changes, and trade-offs from the answer, then draw them as a detailed SVG/HTML explanation page.\n4. ${visualRequirements}\n5. HTML must include: a problem-specific SVG main diagram, a symbol/component/metric definition table, CSS keyframes process animation, formula explanation, simple example, animation explanation, and one final static readable summary diagram or matrix.\n6. No generic templates, placeholders, script, JavaScript, iframe, external resources, network images, or forms.\n7. Include a top-level mermaid diagram, include a top-level html field, and keep total HTML to 4500-30000 characters. Output only this format:\n${DIAGRAM_OPEN}\n${schema}\n${DIAGRAM_CLOSE}`
}

export function extractWhiteboardPayload(content: string): ExcalidrawWhiteboardPayload | null {
  const source = content || ''
  const diagramTagged = source.match(/\[WHITEBOARD_DIAGRAM\]([\s\S]*?)\[\/WHITEBOARD_DIAGRAM\]/i)
  const diagramCandidates = diagramTagged ? [diagramTagged[1]] : []
  const fencedJsonMatches = Array.from(source.matchAll(/```(?:json|JSON)\s*([\s\S]*?)```/g))
  fencedJsonMatches.forEach((match) => {
    const body = match[1] || ''
    if (/"(?:format|steps|mermaid|source|html|html_animation|animation_html)"\s*:/.test(body)) diagramCandidates.push(body)
  })
  const fencedMermaid = source.match(/```mermaid\s*([\s\S]*?)```/i)
  if (fencedMermaid) diagramCandidates.push(JSON.stringify({ format: 'mermaid', source: fencedMermaid[1] }))
  const fencedHtml = source.match(/```html\s*([\s\S]*?)```/i)
  for (const candidate of diagramCandidates) {
    try {
      const parsed = parseDiagramJsonCandidate(candidate)
      if (fencedHtml && isRecord(parsed) && !htmlValueFromRecord(parsed)) {
        ;(parsed as Record<string, unknown>).html = fencedHtml[1]
      }
      const diagram = sanitizeDiagramPayload(parsed)
      const elements = diagramPayloadToElements(parsed)
      if (elements.length || diagram.steps?.length || diagram.mermaid || diagram.markdown || diagram.html) {
        return { elements, note: safeString(parsed.title, 240) || undefined, diagram }
      }
    } catch {
      // Ignore malformed diagram payload and keep chat usable.
    }
  }
  return null
}

export function stripWhiteboardPayload(content: string) {
  return (content || '')
    .replace(/\[WHITEBOARD_DIAGRAM\][\s\S]*?\[\/WHITEBOARD_DIAGRAM\]/gi, '')
    .replace(/\[EXCALIDRAW_ELEMENTS\][\s\S]*?\[\/EXCALIDRAW_ELEMENTS\]/gi, '')
    .replace(/```mermaid\s*[\s\S]*?```/gi, '')
    .replace(/\[WHITEBOARD_OPS\][\s\S]*?\[\/WHITEBOARD_OPS\]/gi, '')
    .replace(/```(?:json)?\s*\{[\s\S]*?"elements"[\s\S]*?\}\s*```/gi, '')
    .trim()
}
