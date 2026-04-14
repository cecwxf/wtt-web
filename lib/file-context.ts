/**
 * File context builder for injecting local file content into Agent messages.
 *
 * Handles smart truncation, language detection, and formatting so the Agent
 * can understand the file content in context.
 */
import { getDesktopBridge } from './desktop'

const EXT_TO_LANG: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript', tsx: 'tsx', jsx: 'jsx',
  go: 'go', rs: 'rust', java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  cs: 'csharp', rb: 'ruby', sh: 'bash', bash: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
  md: 'markdown', mdx: 'markdown', txt: '', rst: 'rst',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', sql: 'sql',
  csv: 'csv', swift: 'swift', kt: 'kotlin', lua: 'lua', php: 'php',
  r: 'r', m: 'matlab',
}

const BINARY_EXTENSIONS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'mp3', 'mp4'])

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function getLang(ext: string): string {
  return EXT_TO_LANG[ext] || ''
}

/**
 * Read local files and format them as context blocks for Agent consumption.
 *
 * Truncation strategy:
 * - < 50KB: full content
 * - 50KB–500KB: first and last 200 lines with omission notice
 * - > 500KB: summary only, agent can request via file bridge
 * - Binary files: type notice only
 */
export async function buildFileContext(
  files: Array<{ path: string; name: string }>
): Promise<string> {
  const bridge = getDesktopBridge()
  if (!bridge) return ''

  const blocks: string[] = []

  for (const file of files) {
    const ext = getExtension(file.name)
    const lang = getLang(ext)

    if (BINARY_EXTENSIONS.has(ext)) {
      blocks.push(`[📄 ${file.name}] (binary file — ${ext.toUpperCase()}, available via file bridge)`)
      continue
    }

    const result = await bridge.fs.readFile(file.path)
    if (!result.ok || !result.content) {
      blocks.push(`[📄 ${file.name}] (failed to read)`)
      continue
    }

    const size = result.size || result.content.length
    let content = result.content
    let truncated = false

    if (size > 500 * 1024) {
      blocks.push(`[📄 ${file.name} (${formatSize(size)})] — file too large, available via file bridge for on-demand reading`)
      continue
    }

    if (size > 50 * 1024) {
      const lines = content.split('\n')
      if (lines.length > 400) {
        const head = lines.slice(0, 200).join('\n')
        const tail = lines.slice(-200).join('\n')
        content = `${head}\n\n... (${lines.length - 400} lines omitted) ...\n\n${tail}`
        truncated = true
      }
    }

    const sizeLabel = formatSize(size)
    const truncLabel = truncated ? ' — truncated' : ''
    blocks.push(`[📄 ${file.name} (${sizeLabel}${truncLabel})]\n\`\`\`${lang}\n${content}\n\`\`\``)
  }

  return blocks.join('\n\n')
}

/**
 * Format a single file's content for inline display in chat draft.
 * Returns a shorter format suitable for the input area.
 */
export function formatFileTag(name: string, size?: number): string {
  const sizeStr = size ? ` ${formatSize(size)}` : ''
  return `📄 ${name}${sizeStr}`
}
