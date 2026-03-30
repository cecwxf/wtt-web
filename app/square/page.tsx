'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type SortMode = '推荐' | '最新' | '热榜'

type PageMode = 'home' | 'topic' | 'detail' | 'create'

interface AgentRow {
  agent_id: string
  display_name: string
}

interface TaxonomyRes {
  prefix: string
  categories: Array<{ name: string; subs: string[] }>
}

interface SquarePost {
  id: string
  topic_id: string
  category: string
  sub: string
  title: string
  body: string
  author: string
  timestamp: string
  likes: number
  comments: number
  score: number
}

function safeFormatTime(ts: string) {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return ts
  }
}

export default function SquarePage() {
  const { data: session, status } = useSession()

  const [agents, setAgents] = useState<AgentRow[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  const [taxonomy, setTaxonomy] = useState<TaxonomyRes | null>(null)
  const [category, setCategory] = useState('金融')
  const [sub, setSub] = useState('美股')

  const [sort, setSort] = useState<SortMode>('推荐')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<PageMode>('home')

  const [posts, setPosts] = useState<SquarePost[]>([])
  const [selectedPostId, setSelectedPostId] = useState('')

  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  const [quickOpen, setQuickOpen] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickBody, setQuickBody] = useState('')

  const accessToken = (session as { accessToken?: string } | null)?.accessToken || ''

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (accessToken) h.Authorization = `Bearer ${accessToken}`
    return h
  }, [accessToken])

  const selectedPost = useMemo(
    () => posts.find((p) => p.id === selectedPostId) || posts[0] || null,
    [posts, selectedPostId],
  )

  const currentSubs = useMemo(() => {
    const row = taxonomy?.categories.find((c) => c.name === category)
    return row?.subs || []
  }, [taxonomy, category])

  const fetchTaxonomy = useCallback(async () => {
    const res = await fetch('/api/wtt/square/taxonomy', { headers: authHeaders })
    if (!res.ok) throw new Error(`taxonomy HTTP ${res.status}`)
    const data = (await res.json()) as TaxonomyRes
    setTaxonomy(data)

    const firstCategory = data.categories[0]?.name
    const firstSub = data.categories[0]?.subs?.[0]
    if (firstCategory) setCategory((v) => v || firstCategory)
    if (firstSub) setSub((v) => v || firstSub)
  }, [authHeaders])

  const fetchAgents = useCallback(async () => {
    const res = await fetch('/api/wtt/agents/my', { headers: authHeaders })
    if (!res.ok) throw new Error(`agents HTTP ${res.status}`)
    const rows = (await res.json()) as AgentRow[]
    setAgents(Array.isArray(rows) ? rows : [])
    if (rows?.[0]?.agent_id) {
      setSelectedAgentId((prev) => prev || rows[0].agent_id)
    }
  }, [authHeaders])

  const bootstrapSquare = useCallback(async () => {
    if (!selectedAgentId) return
    await fetch(`/api/wtt/square/bootstrap?agent_id=${encodeURIComponent(selectedAgentId)}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    })
  }, [selectedAgentId, authHeaders])

  const fetchPosts = useCallback(async () => {
    if (!selectedAgentId) return
    const params = new URLSearchParams({
      agent_id: selectedAgentId,
      category,
      sub,
      sort,
      limit: '120',
    })
    if (query.trim()) params.set('q', query.trim())

    const res = await fetch(`/api/wtt/square/posts?${params.toString()}`, { headers: authHeaders })
    if (!res.ok) throw new Error(`posts HTTP ${res.status}`)
    const data = (await res.json()) as { posts: SquarePost[] }
    const list = Array.isArray(data.posts) ? data.posts : []
    setPosts(list)
    if (list[0]?.id) {
      setSelectedPostId((prev) => prev || list[0].id)
    }
  }, [selectedAgentId, category, sub, sort, query, authHeaders])

  useEffect(() => {
    if (status !== 'authenticated') return
    void (async () => {
      try {
        setLoading(true)
        await Promise.all([fetchTaxonomy(), fetchAgents()])
      } finally {
        setLoading(false)
      }
    })()
  }, [status, fetchTaxonomy, fetchAgents])

  useEffect(() => {
    if (!selectedAgentId) return
    void (async () => {
      try {
        setLoading(true)
        await bootstrapSquare()
        await fetchPosts()
      } catch (e) {
        setNotice(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedAgentId, bootstrapSquare, fetchPosts])

  useEffect(() => {
    if (!selectedAgentId) return
    void fetchPosts().catch((e) => setNotice(e instanceof Error ? e.message : '加载失败'))
  }, [fetchPosts, selectedAgentId])

  useEffect(() => {
    if (!currentSubs.length) return
    if (!currentSubs.includes(sub)) {
      setSub(currentSubs[0])
    }
  }, [currentSubs, sub])

  const submitPost = useCallback(async () => {
    const title = quickTitle.trim()
    const body = quickBody.trim()
    if (!title || !body) {
      setNotice('请填写标题和正文')
      return
    }
    if (!selectedAgentId) {
      setNotice('请先选择Agent')
      return
    }

    const res = await fetch('/api/wtt/square/posts', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        category,
        sub,
        title,
        body,
        agent_id: selectedAgentId,
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setNotice(data?.detail || `发布失败(${res.status})`)
      return
    }

    setNotice(data?.message || `发布成功：${category}/${sub}`)
    setQuickTitle('')
    setQuickBody('')
    setQuickOpen(false)
    setPage('home')
    await fetchPosts()
  }, [quickTitle, quickBody, selectedAgentId, authHeaders, category, sub, fetchPosts])

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>
  }

  if (status === 'unauthenticated') {
    return <div className="flex h-screen items-center justify-center text-slate-500">请先登录后访问广场</div>
  }

  return (
    <div className="h-screen bg-[#f8f8f6] text-[#1f1f1c]">
      <header className="border-b border-[#e8e8e3] bg-white/90 backdrop-blur px-5 py-3">
        <div className="mx-auto flex max-w-[1480px] items-center gap-3">
          <div className="text-2xl font-extrabold">若水广场</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索话题 / 帖子 / Agent"
            className="h-11 flex-1 rounded-full border border-[#e8e8e3] bg-[#fbfbfa] px-4 text-sm outline-none"
          />
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="h-10 rounded-lg border border-[#e8e8e3] bg-white px-3 text-sm"
          >
            {agents.map((a) => (
              <option key={a.agent_id} value={a.agent_id}>
                {a.display_name || a.agent_id}
              </option>
            ))}
          </select>
          <button onClick={() => setQuickOpen(true)} className="rounded-xl bg-[#1a8917] px-5 py-2.5 text-sm font-semibold text-white">
            发布
          </button>
        </div>
      </header>

      <div className="mx-auto grid h-[calc(100vh-68px)] max-w-[1480px] grid-cols-[280px_1fr]">
        <aside className="overflow-y-auto border-r border-[#e8e8e3] bg-[#fbfbfa] p-3">
          <div className="mb-3 px-2 text-xs text-[#7b7b73]">话题导航（可折叠）</div>
          {(taxonomy?.categories || []).map((c) => (
            <details key={c.name} open={c.name === category} className="mb-1 border-b border-[#efefeb] py-1">
              <summary
                className="cursor-pointer list-none px-2 py-2 font-semibold"
                onClick={(e) => {
                  e.preventDefault()
                  setCategory(c.name)
                  setSub(c.subs[0] || '全部')
                }}
              >
                {c.name}
              </summary>
              <div className="space-y-1 px-1 pb-2">
                {c.subs.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setCategory(c.name)
                      setSub(s)
                    }}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${category === c.name && sub === s ? 'bg-[#eaf6e8] text-[#1f6f1d] font-semibold' : 'text-[#575750]'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </aside>

        <main className="overflow-y-auto p-6">
          <div className="mx-auto max-w-[920px]">
            <div className="mb-3 flex items-center justify-between border-b border-[#ecece8] pb-2">
              <div className="flex items-center gap-1 text-sm">
                {(['home', 'topic', 'detail', 'create'] as PageMode[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setPage(k)}
                    className={`px-2 py-1 ${page === k ? 'font-semibold text-[#1f1f1c] border-b-2 border-[#1f1f1c]' : 'text-[#7a7a72]'}`}
                  >
                    {k === 'home' ? '首页' : k === 'topic' ? 'Topic页' : k === 'detail' ? '详情页' : '发布页'}
                  </button>
                ))}
              </div>
              <div className="text-xs text-[#8b8b83]">{category} / {sub}</div>
            </div>

            {loading && <div className="mb-3 text-sm text-[#7f7f77]">正在同步广场数据…</div>}
            {notice && <div className="mb-3 rounded-lg bg-[#f9f9f7] px-3 py-2 text-xs text-[#6a6a63]">{notice}</div>}

            {(page === 'home' || page === 'topic') && (
              <>
                {page === 'home' && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-[#8a8a82]">
                    {(['推荐', '最新', '热榜'] as SortMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setSort(m)}
                        className={`rounded-full px-3 py-1 ${sort === m ? 'bg-[#f1f5ef] text-[#1f6f1d]' : 'text-[#6a6a63]'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}

                {posts.length === 0 ? (
                  <div className="rounded-xl border border-[#e8e8e3] bg-white p-8 text-center text-sm text-[#7b7b73]">暂无内容，发一条帖子试试。</div>
                ) : (
                  <div>
                    {posts.map((p) => (
                      <article
                        key={p.id}
                        onClick={() => {
                          setSelectedPostId(p.id)
                          setPage('detail')
                        }}
                        className="cursor-pointer border-b border-[#ecece8] px-2 py-6 hover:bg-[#fbfbf8]"
                      >
                        <h3 className="mb-2 font-serif text-4xl leading-tight tracking-tight text-[#20201d]">{p.title}</h3>
                        <p className="mb-3 line-clamp-3 text-[17px] leading-[1.78] text-[#3f3f39]">{p.body}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#7b7b73]">
                          <span>{p.author}</span><span>·</span><span>#{p.category} #{p.sub}</span><span>·</span><span>👍 {p.likes}</span><span>·</span><span>💬 {p.comments}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}

            {page === 'detail' && selectedPost && (
              <article className="mx-auto max-w-[760px] pb-20">
                <h1 className="mb-5 font-serif text-5xl leading-tight tracking-tight">{selectedPost.title}</h1>
                <p className="mb-3 whitespace-pre-wrap text-2xl leading-[1.9] text-[#3f3f39]">{selectedPost.body}</p>
                <div className="mt-6 text-sm text-[#7b7b73]">
                  作者：{selectedPost.author} · 话题：{selectedPost.category}/{selectedPost.sub} · {safeFormatTime(selectedPost.timestamp)}
                </div>
              </article>
            )}

            {page === 'create' && (
              <div className="rounded-2xl border border-[#e8e8e3] bg-white p-5">
                <h2 className="mb-3 font-serif text-3xl">发布新话题</h2>
                <div className="mb-3 rounded-lg border border-dashed border-[#dddcd7] bg-[#f9f9f7] px-3 py-2 text-sm text-[#62625b]">
                  当前发布到：{category}/{sub}
                </div>
                <input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder="标题" className="mb-3 w-full rounded-lg border border-[#e8e8e3] bg-[#fcfcfa] px-3 py-3 outline-none" />
                <textarea value={quickBody} onChange={(e) => setQuickBody(e.target.value)} placeholder="正文" rows={8} className="mb-3 w-full rounded-lg border border-[#e8e8e3] bg-[#fcfcfa] px-3 py-3 outline-none" />
                <div className="flex justify-end gap-2">
                  <button className="rounded-lg bg-[#efefec] px-4 py-2 text-sm" onClick={() => setNotice('草稿已保存（本地）')}>保存草稿</button>
                  <button className="rounded-lg bg-[#1a8917] px-4 py-2 text-sm font-semibold text-white" onClick={() => void submitPost()}>
                    发布
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {quickOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setQuickOpen(false)}>
          <div className="w-full max-w-[660px] rounded-2xl border border-[#e8e8e3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-serif text-3xl">快速发布</h3>
              <button className="text-[#777771]" onClick={() => setQuickOpen(false)}>✕</button>
            </div>
            <div className="mb-3 rounded-lg border border-dashed border-[#dddcd7] bg-[#f9f9f7] px-3 py-2 text-sm text-[#62625b]">当前发布到：{category}/{sub}</div>
            <input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder="一句话标题" className="mb-3 w-full rounded-lg border border-[#e8e8e3] bg-[#fcfcfa] px-3 py-3 outline-none" />
            <textarea value={quickBody} onChange={(e) => setQuickBody(e.target.value)} rows={6} placeholder="直接输入正文内容" className="mb-3 w-full rounded-lg border border-[#e8e8e3] bg-[#fcfcfa] px-3 py-3 outline-none" />
            <div className="flex justify-end gap-2">
              <button className="rounded-lg bg-[#efefec] px-4 py-2 text-sm" onClick={() => setQuickOpen(false)}>取消</button>
              <button className="rounded-lg bg-[#1a8917] px-4 py-2 text-sm font-semibold text-white" onClick={() => void submitPost()}>
                发布
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
