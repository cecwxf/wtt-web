'use client'

import ReactMarkdown from 'react-markdown'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
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
  'prose-p:my-2.5 prose-p:whitespace-pre-wrap prose-p:leading-[1.82]',
  'text-slate-800 dark:text-zinc-100',
  'prose-headings:mt-5 prose-headings:mb-2 prose-headings:font-semibold prose-headings:tracking-[-0.015em]',
  'prose-ul:my-2.5 prose-ol:my-2.5 prose-li:my-1',
  'prose-blockquote:my-4 prose-blockquote:rounded-r-xl prose-blockquote:border-l-4 prose-blockquote:border-[#d8cfc0] prose-blockquote:bg-[#f8f3ea]/70 prose-blockquote:px-3 prose-blockquote:py-1 prose-blockquote:text-[#5b5348] dark:prose-blockquote:border-zinc-700 dark:prose-blockquote:bg-zinc-900/70 dark:prose-blockquote:text-zinc-300',
  'prose-pre:my-4 prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-[#e4d9ca] prose-pre:bg-[#faf7f1] prose-pre:p-0 prose-pre:text-slate-800 dark:prose-pre:border-zinc-800 dark:prose-pre:bg-zinc-950 dark:prose-pre:text-zinc-100',
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

function joinClassName(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ')
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

export function RichMarkdown({ children, className }: RichMarkdownProps) {
  const markdown = useMemo(() => normalizeMarkdownMath(normalizeInlineOrderedLists(children || '')), [children])

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
            return (
              <pre className="my-4 overflow-x-auto rounded-xl border border-[#e4d9ca] bg-[#faf7f1] p-3 text-xs leading-5 text-slate-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                {preChildren}
              </pre>
            )
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
