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

function safeMultilineString(value: unknown, max = 1200) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max)
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
