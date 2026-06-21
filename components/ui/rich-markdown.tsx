'use client'

import ReactMarkdown from 'react-markdown'
import { isValidElement, useMemo, useState, type ReactNode } from 'react'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { normalizeMarkdownMath } from '@/lib/markdown-math'

type RichMarkdownProps = {
  children: string
  className?: string
}

const baseClassName = [
  'wtt-rich-markdown prose max-w-none dark:prose-invert',
  'prose-slate dark:prose-zinc',
  'prose-p:my-2.5 prose-p:whitespace-normal prose-p:leading-[1.82]',
  'text-slate-800 dark:text-zinc-100',
  'prose-headings:mt-5 prose-headings:mb-2 prose-headings:font-semibold prose-headings:tracking-[-0.015em]',
  'prose-ul:my-2.5 prose-ol:my-2.5 prose-li:my-1',
  'prose-blockquote:my-4 prose-blockquote:rounded-r-xl prose-blockquote:border-l-4 prose-blockquote:border-[#d8cfc0] prose-blockquote:bg-[#f8f3ea]/70 prose-blockquote:px-3 prose-blockquote:py-1 prose-blockquote:text-[#5b5348] dark:prose-blockquote:border-zinc-700 dark:prose-blockquote:bg-zinc-900/70 dark:prose-blockquote:text-zinc-300',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-table:my-3 prose-table:block prose-table:w-full prose-table:overflow-x-auto prose-table:rounded-lg prose-table:border prose-table:border-slate-200 dark:prose-table:border-zinc-800',
  'prose-thead:bg-slate-50 dark:prose-thead:bg-zinc-900',
  'prose-th:border prose-th:border-slate-200 prose-th:px-3 prose-th:py-2 prose-th:text-left dark:prose-th:border-zinc-800',
  'prose-td:border prose-td:border-slate-200 prose-td:px-3 prose-td:py-2 dark:prose-td:border-zinc-800',
  'prose-a:break-words prose-a:text-[#8b5e22] prose-a:no-underline hover:prose-a:underline dark:prose-a:text-amber-300',
  '[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1',
  '[&_.katex]:text-[1.02em]',
].join(' ')

function codeText(children: unknown): string {
  if (Array.isArray(children)) return children.map(codeText).join('')
  if (children == null) return ''
  return String(children)
}

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children)
  return ''
}

function joinClassName(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ')
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function CopyablePre({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const text = nodeText(children).replace(/\n$/, '')

  const handleCopy = async () => {
    if (!text) return
    try {
      await copyToClipboard(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-[#e4d9ca] bg-[#faf7f1] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-end border-b border-[#e9dfd2] bg-[#f5efe6] px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-[#dfd3c3] bg-white px-2 py-1 text-[11px] font-semibold text-[#6d6256] shadow-sm transition hover:border-[#cbbca9] hover:text-[#2f342f] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-white"
          aria-label="Copy code"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto bg-transparent p-3 text-xs leading-5 text-slate-800 dark:text-zinc-100">
        {children}
      </pre>
    </div>
  )
}

function normalizeInlineOrderedLists(markdown: string): string {
  return String(markdown || '')
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*(?:`|$))/g)
    .map((segment, index) => {
      if (index % 2 === 1) return segment
      const markers = segment.match(/(?:^|[\s。；;，,])(?:\d{1,2})[、，.)]\s*\S/g)
      if (!markers || markers.length < 2) return segment

      return segment
        .replace(/(^|\n)\s*(\d{1,2})[、，)]\s+/g, (_match, prefix: string, n: string) => `${prefix}${n}. `)
        .replace(/([^\n])\s+(\d{1,2})[、，.)]\s+(?=\S)/g, (match, before: string, n: string) => {
          // Avoid turning decimals or version numbers into lists.
          if (/\d$/.test(before) && match.includes('.')) return match
          return `${before}\n${n}. `
        })
    })
    .join('')
}

function normalizeSoftLineBreaks(markdown: string): string {
  const isStructuralLine = (line: string) => {
    const trimmed = line.trim()
    return (
      !trimmed ||
      /^#{1,6}\s/.test(trimmed) ||
      /^>\s?/.test(trimmed) ||
      /^[-*+]\s+/.test(trimmed) ||
      /^\d+[.)]\s+/.test(trimmed) ||
      /^[-*_]{3,}$/.test(trimmed) ||
      /^\|.*\|$/.test(trimmed) ||
      /^:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*$/.test(trimmed) ||
      /^<\/?[a-z][\s>]/i.test(trimmed) ||
      /^(\$\$|\\\[|\\\]|\\begin\{|\\end\{)/.test(trimmed)
    )
  }

  const canJoinFlowLine = (previous: string, next: string) => {
    if (!previous.trim() || !next.trim()) return false
    if (/(?: {2,}|\\)$/.test(previous)) return false
    if (isStructuralLine(next)) return false
    return true
  }

  const canContinuePreviousLine = (line: string) => {
    const trimmed = line.trim()
    if (!isStructuralLine(trimmed)) return true
    return /^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)
  }

  return String(markdown || '')
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((segment, index) => {
      if (index % 2 === 1) return segment

      const lines = segment.split('\n')
      if (lines.length <= 1) return segment

      const out: string[] = []
      for (const line of lines) {
        const previous = out[out.length - 1]
        if (previous !== undefined && canJoinFlowLine(previous, line) && canContinuePreviousLine(previous)) {
          out[out.length - 1] = `${previous.trimEnd()} ${line.trimStart()}`
        } else {
          out.push(line)
        }
      }
      return out.join('\n')
    })
    .join('')
}

export function RichMarkdown({ children, className }: RichMarkdownProps) {
  const markdown = useMemo(
    () => normalizeMarkdownMath(normalizeSoftLineBreaks(normalizeInlineOrderedLists(children || ''))),
    [children],
  )

  return (
    <div className={[baseClassName, className].filter(Boolean).join(' ')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={{
          a({ href, children: linkChildren, ...props }) {
            return (
              <a href={href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer" {...props}>
                {linkChildren}
              </a>
            )
          },
          pre({ children: preChildren }) {
            return <CopyablePre>{preChildren}</CopyablePre>
          },
          code({ inline, className: codeClassName, children: codeChildren, ...props }: {
            inline?: boolean
            className?: string
            children?: ReactNode
          }) {
            if (inline) {
              return (
                <code
                  className={joinClassName(
                    'rounded-md bg-[#efe7d8] px-1.5 py-0.5 font-mono text-[0.86em] font-semibold text-[#4b4033] dark:bg-zinc-800 dark:text-zinc-100',
                    codeClassName,
                  )}
                  {...props}
                >
                  {codeChildren}
                </code>
              )
            }
            const match = /language-([^\s]+)/.exec(codeClassName || '')
            const lang = match?.[1]
            return (
              <code
                className={joinClassName(
                  'block min-w-full whitespace-pre bg-transparent p-0 font-mono text-xs font-normal leading-5 text-slate-800 dark:text-zinc-100',
                  codeClassName,
                )}
                data-language={lang || undefined}
                {...props}
              >
                {codeText(codeChildren).replace(/\n$/, '')}
              </code>
            )
          },
          table({ children: tableChildren }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-800">
                <table className="my-0 w-full border-collapse text-sm">
                  {tableChildren}
                </table>
              </div>
            )
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
