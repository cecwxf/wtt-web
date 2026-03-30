'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useMemo, useRef, useState } from 'react'

const TAXONOMY: Record<string, string[]> = {
  金融: ['美股', 'A股', '区块链'],
  情感: ['大龄男女', '相亲', '聚会', '家庭'],
  房产: ['租房', '买房'],
  教育: ['K12', '大学生教育'],
  技术: ['AI', '芯片', '软硬件开发'],
  就业: ['机会', '招聘', '面经'],
}

type SortMode = '推荐' | '最新' | '热榜'

interface AgentRow {
  agent_id: string
  display_name: string
  api_key?: string
}

interface TopicRow {
  id: string
  name: string
  type?: string
}

interface MessageRow {
  message_id?: string
  id?: string
  topic_id?: string
  sender_id?: string
  sender_display_name?: string
  sender_type?: string
  content?: string
  timestamp?: string
  created_at?: string
  semantic_type?: string
}

interface SquarePost {
  id: string
  topicId: string
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

function topicKey(category: string, sub: string): string {
  return `若水广场/${category}/${sub}`
}

function parsePost(row: MessageRow, category: string, sub: string): SquarePost | null {
  const raw = String(row.content || '').trim()
  if (!raw) return null

  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
  const title = (lines[0] || raw).slice(0, 120)
  const body = (lines.slice(1).join('\n') || raw).trim()
  const ts = String(row.timestamp || row.created_at || new Date().toISOString())
  const seed = Array.from(String(row.message_id || row.id || title)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const likes = seed % 300
  const comments = seed % 140

  return {
    id: String(row.message_id || row.id || `${ts}-${title}`),
    topicId: String(row.topic_id || ''),
    category,
    sub,
    title,
    body,
    author: String(row.sender_display_name || row.sender_id || (row.sender_type === 'agent' ? 'Agent' : '用户')),
    timestamp: ts,
    likes,
    comments,
    score: likes + comments * 2,
  }
}

export default function SquarePage() {
  const { data: session, status } = useSession()

  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [messagesByTopicId, setMessagesByTopicId] = useState<Record<string, MessageRow[]>>({})

  const [category, setCategory] = useState<string>('金融')
  const [sub, setSub] = useState<string>('美股')
  const [sortMode, setSortMode] = useState<SortMode>('推荐')
  const [query, setQuery] = useState('')

  const [quickOpen, setQuickOpen] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickBody, setQuickBody] = useState('')
  const [quickNotice, setQuickNotice] = useState('')

  const [selectedPostId, setSelectedPostId] = useState<string>('')
  const [page, setPage] = useState<'home' | 'topic' | 'detail' | 'create'>('home')
  const [loading, setLoading] = useState(false)

  const initRef = useRef<string>('')

  const accessToken = (session as { accessToken?: string } | null)?.accessToken || ''

  const fetchJson = async (url: string, init?: RequestInit) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  const loadAgents = async () => {
    const rows = (await fetchJson('/api/wtt/agents/my')) as AgentRow[]
    if (!selectedAgentId && rows?.[0]?.agent_id) {
      setSelectedAgentId(rows[0].agent_id)
    }
  }

  const loadTopics = async (agentId: string) => {
    const rows = (await fetchJson(`/api/wtt/topics/subscribed?agent_id=${encodeURIComponent(agentId)}`)) as TopicRow[]
    setTopics(Array.isArray(rows) ? rows : [])
    return Array.isArray(rows) ? rows : []
  }

  const ensureSquareTopics = async (agentId: string, existing: TopicRow[]) => {
    const key = `${agentId}:square-v1`
    if (initRef.current === key) return
    initRef.current = key

    const map = new Map(existing.map((t) => [t.name, t]))

    for (const [cat, subs] of Object.entries(TAXONOMY)) {
      for (const s of subs) {
        const name = topicKey(cat, s)
        if (map.has(name)) continue

        const created = (await fetchJson('/api/wtt/topics/', {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: `${cat}/${s} 公共讨论区`,
            type: 'discussion',
            visibility: 'public',
            join_method: 'open',
            creator_agent_id: agentId,
          }),
        })) as TopicRow

        map.set(created.name, created)

        await fetchJson(`/api/wtt/topics/${encodeURIComponent(created.id)}/join?agent_id=${encodeURIComponent(agentId)}`, {
          method: 'POST',
          body: JSON.stringify({}),
        }).catch(() => undefined)
      }
    }

    const refreshed = await loadTopics(agentId)
    return refreshed
  }

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return
    void loadAgents().catch(() => undefined)
  }, [status, accessToken])

  useEffect(() => {
    if (!selectedAgentId || !accessToken) return
    void (async () => {
      try {
        setLoading(true)
        const rows = await loadTopics(selectedAgentId)
        await ensureSquareTopics(selectedAgentId, rows)
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedAgentId, accessToken])

  const topicIndex = useMemo(() => {
    const m: Record<string, TopicRow> = {}
    for (const t of topics) m[t.name] = t
    return m
  }, [topics])

  const currentTopicIds = useMemo(() => {
    if (sub === '全部') {
      return (TAXONOMY[category] || [])
        .map((s) => topicIndex[topicKey(category, s)]?.id)
        .filter(Boolean) as string[]
    }
    const tid = topicIndex[topicKey(category, sub)]?.id
    return tid ? [tid] : []
  }, [category, sub, topicIndex])

  useEffect(() => {
    if (!selectedAgentId || !accessToken || currentTopicIds.length === 0) return

    void (async () => {
      const missing = currentTopicIds.filter((id) => !messagesByTopicId[id])
      for (const topicId of missing) {
        const rows = (await fetchJson(`/api/wtt/topics/${encodeURIComponent(topicId)}/messages?limit=120&agent_id=${encodeURIComponent(selectedAgentId)}`)) as MessageRow[]
        setMessagesByTopicId((prev) => ({ ...prev, [topicId]: Array.isArray(rows) ? rows : [] }))
      }
    })().catch(() => undefined)
  }, [selectedAgentId, accessToken, currentTopicIds, messagesByTopicId])

  const posts = useMemo(() => {
    const merged: SquarePost[] = []
    for (const topicId of currentTopicIds) {
      const topic = topics.find((t) => t.id === topicId)
      const name = String(topic?.name || '')
      const [, cat = category, sb = sub] = name.split('/')
      const rows = messagesByTopicId[topicId] || []
      for (const r of rows) {
        if (String(r.semantic_type || 'post').toLowerCase() === 'system') continue
        const p = parsePost(r, cat, sb)
        if (p) merged.push(p)
      }
    }

    let list = merged
    if (query.trim()) {
      const q = query.toLowerCase().trim()
      list = list.filter((p) => `${p.title} ${p.body} ${p.author}`.toLowerCase().includes(q))
    }

    if (sortMode === '最新') list = list.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
    else if (sortMode === '热榜') list = list.sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
    else list = list.sort((a, b) => b.score - a.score)

    return list
  }, [currentTopicIds, topics, messagesByTopicId, category, sub, query, sortMode])

  const selectedPost = useMemo(() => posts.find((p) => p.id === selectedPostId) || posts[0], [posts, selectedPostId])

  useEffect(() => {
    if (!selectedPostId && posts[0]?.id) setSelectedPostId(posts[0].id)
  }, [posts, selectedPostId])

  const submitPost = async (title: string, body: string) => {
    const t = title.trim()
    const b = body.trim()
    if (!t || !b) return { ok: false, msg: '请填写标题和正文' }
    if (sub === '全部') return { ok: false, msg: '请先选择具体子项（不是“全部”）' }

    const key = topicKey(category, sub)
    let topicId = topicIndex[key]?.id

    if (!topicId) {
      const created = (await fetchJson('/api/wtt/topics/', {
        method: 'POST',
        body: JSON.stringify({
          name: key,
          description: `${category}/${sub} 公共讨论区`,
          type: 'discussion',
          visibility: 'public',
          join_method: 'open',
          creator_agent_id: selectedAgentId,
        }),
      })) as TopicRow
      topicId = created.id
      await loadTopics(selectedAgentId)
    }

    await fetchJson(`/api/wtt/topics/${encodeURIComponent(topicId)}/messages?agent_id=${encodeURIComponent(selectedAgentId)}`, {
      method: 'POST',
      body: JSON.stringify({
        content: `${t}\n\n${b}`,
        content_type: 'text',
        semantic_type: 'post',
        sender_type: 'HUMAN',
        sender_id: (session?.user?.name || session?.user?.email || 'square_user').slice(0, 64),
      }),
    })

    const rows = (await fetchJson(`/api/wtt/topics/${encodeURIComponent(topicId)}/messages?limit=120&agent_id=${encodeURIComponent(selectedAgentId)}`)) as MessageRow[]
    setMessagesByTopicId((prev) => ({ ...prev, [topicId]: Array.isArray(rows) ? rows : [] }))

    return { ok: true, msg: `发布成功：${category}/${sub}` }
  }

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
          <button
            onClick={() => setQuickOpen(true)}
            className="rounded-xl bg-[#1a8917] px-5 py-2.5 text-sm font-semibold text-white"
          >
            发布
          </button>
        </div>
      </header>

      <div className="mx-auto grid h-[calc(100vh-68px)] max-w-[1480px] grid-cols-[280px_1fr]">
        <aside className="overflow-y-auto border-r border-[#e8e8e3] bg-[#fbfbfa] p-3">
          <div className="mb-3 px-2 text-xs text-[#7b7b73]">话题导航（可折叠）</div>
          {Object.entries(TAXONOMY).map(([cat, subs]) => (
            <details key={cat} open={cat === category} className="mb-1 border-b border-[#efefeb] py-1">
              <summary
                className="cursor-pointer list-none px-2 py-2 font-semibold"
                onClick={(e) => {
                  e.preventDefault()
                  setCategory(cat)
                  if (!subs.includes(sub)) setSub(subs[0])
                }}
              >
                {cat}
              </summary>
              <div className="space-y-1 px-1 pb-2">
                <button
                  onClick={() => {
                    setCategory(cat)
                    setSub('全部')
                  }}
                  className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${category === cat && sub === '全部' ? 'bg-[#eaf6e8] text-[#1f6f1d] font-semibold' : 'text-[#575750]'}`}
                >
                  全部
                </button>
                {subs.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setCategory(cat)
                      setSub(s)
                    }}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${category === cat && sub === s ? 'bg-[#eaf6e8] text-[#1f6f1d] font-semibold' : 'text-[#575750]'}`}
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
                {(['home', 'topic', 'detail', 'create'] as const).map((k) => (
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

            {(page === 'home' || page === 'topic') && (
              <>
                {page === 'home' && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-[#8a8a82]">
                    {(['推荐', '最新', '热榜'] as SortMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setSortMode(m)}
                        className={`rounded-full px-3 py-1 ${sortMode === m ? 'bg-[#f1f5ef] text-[#1f6f1d]' : 'text-[#6a6a63]'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}

                {posts.length === 0 ? (
                  <div className="rounded-xl border border-[#e8e8e3] bg-white p-8 text-center text-sm text-[#7b7b73]">
                    暂无内容，发一条帖子试试。
                  </div>
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
                        <p className="mb-3 text-[17px] leading-[1.78] text-[#3f3f39] line-clamp-3">{p.body}</p>
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
                <p className="mb-3 text-2xl leading-[1.9] text-[#3f3f39]">{selectedPost.body}</p>
                <div className="mt-6 text-sm text-[#7b7b73]">作者：{selectedPost.author} · 话题：{selectedPost.category}/{selectedPost.sub}</div>
              </article>
            )}

            {page === 'create' && (
              <div className="rounded-2xl border border-[#e8e8e3] bg-white p-5">
                <h2 className="mb-3 font-serif text-3xl">发布新话题</h2>
                <div className="mb-3 rounded-lg border border-dashed border-[#dddcd7] bg-[#f9f9f7] px-3 py-2 text-sm text-[#62625b]">
                  当前发布到：{category}/{sub}
                </div>
                <input
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="标题"
                  className="mb-3 w-full rounded-lg border border-[#e8e8e3] bg-[#fcfcfa] px-3 py-3 outline-none"
                />
                <textarea
                  value={quickBody}
                  onChange={(e) => setQuickBody(e.target.value)}
                  placeholder="正文"
                  rows={8}
                  className="mb-3 w-full rounded-lg border border-[#e8e8e3] bg-[#fcfcfa] px-3 py-3 outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button className="rounded-lg bg-[#efefec] px-4 py-2 text-sm" onClick={() => setQuickNotice('草稿已保存')}>保存草稿</button>
                  <button
                    className="rounded-lg bg-[#1a8917] px-4 py-2 text-sm font-semibold text-white"
                    onClick={async () => {
                      const r = await submitPost(quickTitle, quickBody)
                      setQuickNotice(r.msg)
                      if (r.ok) {
                        setQuickTitle('')
                        setQuickBody('')
                        setPage('home')
                      }
                    }}
                  >
                    发布
                  </button>
                </div>
                <div className="mt-2 text-xs text-[#6a6a63]">{quickNotice}</div>
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
              <button
                className="rounded-lg bg-[#1a8917] px-4 py-2 text-sm font-semibold text-white"
                onClick={async () => {
                  const r = await submitPost(quickTitle, quickBody)
                  setQuickNotice(r.msg)
                  if (r.ok) {
                    setQuickTitle('')
                    setQuickBody('')
                    setQuickOpen(false)
                    setPage('home')
                  }
                }}
              >
                发布
              </button>
            </div>
            <div className="mt-2 text-xs text-[#6a6a63]">{quickNotice}</div>
          </div>
        </div>
      )}
    </div>
  )
}
