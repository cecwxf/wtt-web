'use client'

import { ExternalLink, X } from 'lucide-react'

export type ArtifactPreview = {
  title?: string
  previewUrl: string
  type?: string
}

type Props = {
  artifact: ArtifactPreview | null
  locale?: 'zh' | 'en'
  onClose?: () => void
  className?: string
}

function normalizePreviewUrl(value: string) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (url.startsWith('/api/wtt/')) return url
  if (url.startsWith('/artifacts/')) return `/api/wtt${url}`
  return url
}

export function ArtifactPreviewPanel({ artifact, locale = 'zh', onClose, className = '' }: Props) {
  const src = artifact ? normalizePreviewUrl(artifact.previewUrl) : ''
  const title = artifact?.title || (locale === 'zh' ? 'OpenDesign 预览' : 'OpenDesign preview')

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#111827] shadow-2xl ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-[#0b1120] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{title}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
            {artifact?.type || 'opendesign'} · sandbox iframe
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {src ? (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-cyan-300 hover:text-cyan-200"
              title={locale === 'zh' ? '新窗口打开' : 'Open in new window'}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-rose-300 hover:text-rose-200"
              title={locale === 'zh' ? '关闭' : 'Close'}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      {src ? (
        <iframe
          title={title}
          src={src}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="min-h-[520px] flex-1 border-0 bg-white"
        />
      ) : (
        <div className="flex min-h-[320px] flex-1 items-center justify-center p-6 text-center">
          <div>
            <p className="text-sm font-black text-slate-200">{locale === 'zh' ? '等待 OpenDesign artifact' : 'Waiting for OpenDesign artifact'}</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">
              {locale === 'zh'
                ? 'Agent 生成并上传 index.html 后，这里会直接展示 sandbox 预览。'
                : 'Once the agent uploads index.html, this panel renders the sandboxed preview.'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
