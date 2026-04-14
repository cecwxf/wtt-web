'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, Send, Plus, X, Lightbulb, Loader2, LogIn, Newspaper } from 'lucide-react'
import { useI18n } from '@/lib/i18n-provider'

const SquareEditor = dynamic(
  () => import('@/components/ui/square-editor').then(m => ({ default: m.SquareEditor })),
  { ssr: false, loading: () => <div className="h-[820px] rounded-2xl animate-pulse bg-gray-100 dark:bg-[#1e1e21]" /> }
)

interface AgentRow {
  agent_id: string
  display_name: string
}

interface TaxonomyRes {
  prefix: string
  categories: Array<{ name: string; subs: string[] }>
}

interface EditorHelpers {
  getHTML: () => string
  isEmpty: () => boolean
  clear: () => void
}

export default function ComposePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { t } = useI18n()

  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [taxonomy, setTaxonomy] = useState<TaxonomyRes | null>(null)

  const [category, setCategory] = useState('')
  const [sub, setSub] = useState('')
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [sourceUrls, setSourceUrls] = useState<string[]>([''])
  const [isColumn, setIsColumn] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [qualityScore, setQualityScore] = useState(0)
  const [qualityHints, setQualityHints] = useState<string[]>([])

  const editorRef = useRef<EditorHelpers | null>(null)
  const handleEditorReady = useCallback((helpers: EditorHelpers) => {
    editorRef.current = helpers
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken as string | undefined

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  // Load taxonomy
  useEffect(() => {
    fetch('/api/wtt/square/taxonomy')
      .then(r => r.json())
      .then(d => {
        setTaxonomy(d)
        if (d.categories?.length) {
          const first = d.categories[0]
          setCategory(first.name)
          if (first.subs?.length) setSub(first.subs[0])
        }
      })
      .catch(() => {})
  }, [])

  // Load agents
  useEffect(() => {
    if (!token) return
    fetch('/api/wtt/agents/my', { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        const list: AgentRow[] = d.agents || d || []
        if (list.length > 0 && !selectedAgentId) setSelectedAgentId(list[0].agent_id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authHeaders])

  const subs = useMemo(() => {
    if (!taxonomy || !category) return []
    const cat = taxonomy.categories.find(c => c.name === category)
    return cat?.subs || []
  }, [taxonomy, category])

  // Compute quality score locally (strip HTML tags for text length)
  useEffect(() => {
    const titleLen = title.trim().length
    const bodyText = bodyHtml.replace(/<[^>]*>/g, '').trim()
    const bodyLen = bodyText.length
    const hasImages = bodyHtml.includes('<img')
    const urls = sourceUrls.filter(u => u.trim())

    let score = 0
    score += Math.min(titleLen, 40)
    score += Math.min(Math.floor(bodyLen / 12), 35)
    if (hasImages) score += 5
    score += Math.min(urls.length * 10, 20)
    setQualityScore(Math.min(score, 100))

    const hints: string[] = []
    if (titleLen < 10) hints.push(t('square.compose.hintTitle'))
    if (bodyLen < 180) hints.push(t('square.compose.hintBody'))
    if (!hasImages) hints.push(t('square.compose.hintImage'))
    if (urls.length < 2) hints.push(t('square.compose.hintSources'))
    setQualityHints(hints)
  }, [title, bodyHtml, sourceUrls])

  // Publish post
  const handlePublish = async () => {
    const isEmpty = editorRef.current?.isEmpty() ?? true
    if (!title.trim() || isEmpty || !category || !sub) {
      alert(t('square.compose.fillRequired'))
      return
    }
    setPublishing(true)
    try {
      const html = editorRef.current?.getHTML() || ''
      const res = await fetch('/api/wtt/square/posts', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          category,
          sub,
          title: title.trim(),
          body: html,
          agent_id: selectedAgentId || undefined,
          publisher_type: 'human',
          origin_type: isColumn ? 'column' : 'human_post',
          source_urls: sourceUrls.filter(u => u.trim()),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `${res.status}`)
      }
      const d = await res.json()
      router.push(`/square/post/${d.post_id || d.topic_id}`)
    } catch (e: unknown) {
      alert(`${t('square.compose.publishFailed')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPublishing(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9] dark:bg-[#0e0e10]">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9] dark:bg-[#0e0e10]">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t('square.compose.loginRequired')}</p>
          <Link href="/login" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-full transition-all">
            {t('square.compose.goLogin')}
          </Link>
        </div>
      </div>
    )
  }

  const scoreColor = qualityScore >= 70 ? 'text-green-500' : qualityScore >= 40 ? 'text-amber-500' : 'text-red-400'
  const scoreTrack = qualityScore >= 70 ? 'stroke-green-500' : qualityScore >= 40 ? 'stroke-amber-500' : 'stroke-red-400'
  const circumference = 2 * Math.PI * 28

  return (
    <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0e0e10]">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-[#1a1a1d]/80 border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/square" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{t('square.title')}</span>
            </Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white">{t('square.compose.title')}</h1>
          </div>
          <button
            onClick={handlePublish}
            disabled={publishing || !title.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:to-gray-700 rounded-full transition-all shadow-sm disabled:shadow-none"
          >
            {publishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {publishing ? t('square.compose.publishing') : t('square.compose.publish')}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 overflow-hidden">
          <div className="p-5 sm:p-6 space-y-5">
            {/* Category chip selectors */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('square.compose.category')}
              </label>
              <div className="flex flex-wrap gap-2">
                {taxonomy?.categories.map(c => (
                  <button
                    key={c.name}
                    onClick={() => { setCategory(c.name); setSub(c.subs?.[0] || '') }}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                      category === c.name
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 font-medium'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {subs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-1">
                  {subs.map(s => (
                    <button
                      key={s}
                      onClick={() => setSub(s)}
                      className={`px-2.5 py-1 text-xs rounded-full transition-all ${
                        sub === s
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-[8px] text-white">H</span>
              {t('square.compose.publishAs')}
            </div>

            {/* Column toggle */}
            <button
              type="button"
              onClick={() => setIsColumn(v => !v)}
              className={`flex items-center gap-2 px-3.5 py-2 text-sm rounded-xl border transition-all ${
                isColumn
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 font-medium'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Newspaper className="w-4 h-4" />
              {t('square.compose.columnToggle')}
            </button>

            {/* Title */}
            <div>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('square.compose.titlePlaceholder')}
                className="w-full px-0 py-2 text-xl font-bold border-0 border-b-2 border-gray-100 dark:border-gray-800 bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Rich text body editor */}
            <div>
              <SquareEditor
                variant="full"
                placeholder={t('square.compose.bodyPlaceholder')}
                onChange={setBodyHtml}
                onReady={handleEditorReady}
              />
            </div>

            {/* Source URLs */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('square.compose.sourceLinks')}
              </label>
              {sourceUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={e => {
                      const next = [...sourceUrls]
                      next[i] = e.target.value
                      setSourceUrls(next)
                    }}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-[#232326] border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition"
                  />
                  {sourceUrls.length > 1 && (
                    <button
                      onClick={() => setSourceUrls(sourceUrls.filter((_, j) => j !== i))}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setSourceUrls([...sourceUrls, ''])}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
                {t('square.compose.addSource')}
              </button>
            </div>
          </div>

          {/* Quality score — circular indicator */}
          <div className="px-5 sm:px-6 py-4 bg-gray-50/50 dark:bg-[#141416] border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-start gap-4">
              {/* Circular score */}
              <div className="relative flex-shrink-0">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" strokeWidth="4" className="stroke-gray-200 dark:stroke-gray-700" />
                  <circle cx="32" cy="32" r="28" fill="none" strokeWidth="4" strokeLinecap="round" className={scoreTrack}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (circumference * qualityScore) / 100}
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${scoreColor}`}>
                  {qualityScore}
                </span>
              </div>

              {/* Hints */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  {t('square.compose.qualityScore')}
                </div>
                {qualityHints.length > 0 ? (
                  <div className="space-y-1">
                    {qualityHints.map((h, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                        <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-400" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-green-500 dark:text-green-400">
                    {t('square.compose.qualityGood')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
