const latexCommandPattern =
  /\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|text|frac|dfrac|tfrac|sum|prod|sqrt|cos|sin|tan|log|ln|exp|cdot|times|quad|qquad|leq?|geq?|neq|approx|sim|to|infty|mathbf|mathrm|mathbb|mathcal|operatorname|left|right|begin|end|min|max|argmin|argmax|nabla|partial)\b/

function normalizeEscapedNewlines(segment: string) {
  return segment
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n(?![A-Za-z])/g, '\n')
    .replace(/\\r(?![A-Za-z])/g, '\n')
}

function normalizeStandaloneMathLines(segment: string) {
  return segment.split('\n').map((line) => {
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.startsWith('$') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('>') ||
      /^#{1,6}\s/.test(trimmed) ||
      /^[-*+]\s/.test(trimmed)
    ) {
      return line
    }
    const looksLikeFormula = latexCommandPattern.test(trimmed) && /(?:=|<|>|\\leq?|\\geq?|\\neq|\\approx|\\sim|\\to)/.test(trimmed)
    return looksLikeFormula ? `\n\n${line.match(/^\s*/)?.[0] || ''}$$\n${trimmed}\n$$\n\n` : line
  }).join('\n')
}

function normalizeMathDelimiters(segment: string) {
  const normalized = normalizeEscapedNewlines(segment)
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\(?=(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|text|frac|dfrac|tfrac|sum|prod|sqrt|cos|sin|tan|log|ln|exp|cdot|times|quad|qquad|leq?|geq?|neq|approx|sim|to|infty|mathbf|mathrm|mathbb|mathcal|operatorname|left|right|begin|end|min|max|argmin|argmax|nabla|partial)\b)/g, '\\')
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, formula: string) => `\n\n$$\n${formula.trim()}\n$$\n\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, formula: string) => `$${formula.trim()}$`)
  return normalizeStandaloneMathLines(normalized)
}

function splitMarkdownCodeSensitiveSegments(markdown: string): Array<{ text: string; protected: boolean }> {
  const input = String(markdown || '')
  const segments: Array<{ text: string; protected: boolean }> = []
  const pattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*(?:`|$))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), protected: false })
    }
    segments.push({ text: match[0], protected: true })
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), protected: false })
  }

  return segments
}

export function normalizeMarkdownMath(markdown: string) {
  return splitMarkdownCodeSensitiveSegments(markdown)
    .map((segment) => (segment.protected ? segment.text : normalizeMathDelimiters(segment.text)))
    .join('')
}
