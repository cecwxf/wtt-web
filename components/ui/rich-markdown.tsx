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
  'wtt-rich-markdown prose prose-sm max-w-none dark:prose-invert',
  'prose-slate dark:prose-zinc',
  'prose-p:my-2 prose-p:whitespace-pre-wrap prose-p:leading-7',
  'prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-bold',
  'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5',
  'prose-blockquote:my-3 prose-blockquote:border-l-4 prose-blockquote:border-slate-300 prose-blockquote:pl-3 prose-blockquote:text-slate-600 dark:prose-blockquote:border-zinc-700 dark:prose-blockquote:text-zinc-300',
  'prose-pre:my-3 prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-slate-200 prose-pre:bg-slate-950 prose-pre:p-0 prose-pre:text-slate-100 dark:prose-pre:border-zinc-800 dark:prose-pre:bg-black',
  'prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.86em] prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none dark:prose-code:bg-zinc-800',
  'prose-pre:prose-code:bg-transparent prose-pre:prose-code:p-0 prose-pre:prose-code:font-mono prose-pre:prose-code:font-normal',
  'prose-table:my-3 prose-table:block prose-table:w-full prose-table:overflow-x-auto prose-table:rounded-lg prose-table:border prose-table:border-slate-200 dark:prose-table:border-zinc-800',
  'prose-thead:bg-slate-50 dark:prose-thead:bg-zinc-900',
  'prose-th:border prose-th:border-slate-200 prose-th:px-3 prose-th:py-2 prose-th:text-left dark:prose-th:border-zinc-800',
  'prose-td:border prose-td:border-slate-200 prose-td:px-3 prose-td:py-2 dark:prose-td:border-zinc-800',
  'prose-a:break-words prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline dark:prose-a:text-cyan-300',
  '[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1',
  '[&_.katex]:text-[1.02em]',
].join(' ')

function codeText(children: unknown): string {
  if (Array.isArray(children)) return children.map(codeText).join('')
  if (children == null) return ''
  return String(children)
}

export function RichMarkdown({ children, className }: RichMarkdownProps) {
  const markdown = useMemo(() => normalizeMarkdownMath(children || ''), [children])

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
              <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-100 dark:border-zinc-800 dark:bg-black">
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
                <code className={codeClassName} {...props}>
                  {codeChildren}
                </code>
              )
            }
            const match = /language-([^\s]+)/.exec(codeClassName || '')
            const lang = match?.[1]
            return (
              <code className={codeClassName} data-language={lang || undefined} {...props}>
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
