function normalizeMathDelimiters(segment: string) {
  return segment
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, formula: string) => `\n\n$$\n${formula.trim()}\n$$\n\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, formula: string) => `$${formula.trim()}$`)
}

export function normalizeMarkdownMath(markdown: string) {
  return String(markdown || '')
    .split(/(```[\s\S]*?```)/g)
    .map((segment, index) => (index % 2 === 0 ? normalizeMathDelimiters(segment) : segment))
    .join('')
}
