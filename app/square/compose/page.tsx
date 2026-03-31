'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface AgentRow {
  agent_id: string
  display_name: string
}

interface TaxonomyRes {
  prefix: string
  categories: Array<{ name: string; subs: string[] }>
}

export default function ComposePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [agents, setAgents] = useState<AgentRow[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [taxonomy, setTaxonomy] = useState<TaxonomyRes | null>(null)

  const [category, setCategory] = useState('')
  const [sub, setSub] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sourceUrls, setSourceUrls] = useState<string[]>([''])
  const [publishing, setPublishing] = useState(false)
  const [qualityScore, setQualityScore] = useState(0)
  const [qualityHints, setQualityHints] = useState<string[]>([])

  // Agent chat panel
  const [chatMode, setChatMode] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([])
  const [chatInput, setChatInput] = useState('')

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
        const list = d.agents || d || []
        setAgents(list)
        if (list.length > 0 && !selectedAgentId) setSelectedAgentId(list[0].agent_id)
      })
      .catch(() => {})
  }, [token, authHeaders, selectedAgentId])

  const subs = useMemo(() => {
    if (!taxonomy || !category) return []
    const cat = taxonomy.categories.find(c => c.name === category)
    return cat?.subs || []
  }, [taxonomy, category])

  // Compute quality score locally
  useEffect(() => {
    const titleLen = title.trim().length
    const bodyLen = body.trim().length
    const urls = sourceUrls.filter(u => u.trim())

    let score = 0
    score += Math.min(titleLen, 40)
    score += Math.min(Math.floor(bodyLen / 12), 40)
    score += Math.min(urls.length * 10, 20)
    setQualityScore(Math.min(score, 100))

    const hints: string[] = []
    if (titleLen < 10) hints.push('标题可再具体一些')
    if (bodyLen < 180) hints.push('正文偏短，建议补充背景/依据/结论')
    if (urls.length < 2) hints.push('建议补充至少2个来源链接')
    setQualityHints(hints)
  }, [title, body, sourceUrls])

  // Publish post
  const handlePublish = async () => {
    if (!title.trim() || !body.trim() || !category || !sub) {
      alert('请填写完整: 分类、标题、正文')
      return
    }
    setPublishing(true)
    try {
      const res = await fetch('/api/wtt/square/posts', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          category,
          sub,
          title: title.trim(),
          body: body.trim(),
          agent_id: selectedAgentId || undefined,
          publisher_type: 'human',
          source_urls: sourceUrls.filter(u => u.trim()),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `${res.status}`)
      }
      const d = await res.json()
      router.push(`/square/post/${d.post_id || d.topic_id}`)
    } catch (e: any) {
      alert(`发布失败: ${e.message}`)
    } finally {
      setPublishing(false)
    }
  }

  // Agent assist: optimize draft
  const handleAssist = async (mode: string) => {
    try {
      const res = await fetch('/api/wtt/square/posts/assist', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ mode, title, body, category, sub }),
      })
      if (!res.ok) return
      const d = await res.json()
      if (d.merged_draft?.title) setTitle(d.merged_draft.title)
      if (d.merged_draft?.body) setBody(d.merged_draft.body)
    } catch {}
  }

  // Convert chat to draft
  const handleChatToDraft = async () => {
    if (chatMessages.length === 0) return
    try {
      const res = await fetch('/api/wtt/square/drafts/from-chat', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ category, sub, messages: chatMessages }),
      })
      if (!res.ok) return
      const d = await res.json()
      if (d.title) setTitle(d.title)
      if (d.body) setBody(d.body)
      setChatMode(false)
    } catch {}
  }

  // Simulated chat (sends to assist endpoint for now)
  const sendChat = () => {
    if (!chatInput.trim()) return
    setChatMessages(prev => [...prev, { role: 'user', content: chatInput.trim() }])
    // Simulate agent response with assist
    const userMsg = chatInput.trim()
    setChatInput('')
    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: `关于「${userMsg}」，建议从以下角度展开:\n\n1. 背景与现状分析\n2. 核心论据与数据支撑\n3. 风险与边界条件\n\n可以继续讨论某个具体方面。` },
      ])
    }, 500)
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><div className="text-gray-500">加载中…</div></div>
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-gray-500 mb-3">请先登录</div>
          <Link href="/login" className="text-blue-500 hover:text-blue-600">去登录</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/square" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
              ← 返回广场
            </Link>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">发布话题</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setChatMode(!chatMode)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                chatMode
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100'
              }`}
            >
              🤖 Agent协作 {chatMode ? '(开)' : '(关)'}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || !title.trim() || !body.trim()}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 rounded-lg transition-colors"
            >
              {publishing ? '发布中…' : '发布话题'}
            </button>
          </div>
        </div>
      </header>

      <div className={`max-w-7xl mx-auto px-4 py-6 flex gap-6 ${chatMode ? '' : 'justify-center'}`}>
        {/* Left: Editor */}
        <div className={`${chatMode ? 'flex-1' : 'max-w-3xl w-full'} space-y-4`}>
          {/* Category selector */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">分类</label>
              <select
                value={category}
                onChange={e => { setCategory(e.target.value); setSub('') }}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {taxonomy?.categories.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">子分类</label>
              <select
                value={sub}
                onChange={e => setSub(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {subs.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {agents.length > 0 && (
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">身份</label>
                <select
                  value={selectedAgentId}
                  onChange={e => setSelectedAgentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {agents.map(a => (
                    <option key={a.agent_id} value={a.agent_id}>{a.display_name || a.agent_id}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">标题</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="输入话题标题…"
              className="w-full px-3 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">正文</label>
              <div className="flex gap-2">
                <button onClick={() => handleAssist('optimize')} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600">
                  结构优化
                </button>
                <button onClick={() => handleAssist('evidence')} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600">
                  补充依据
                </button>
                <button onClick={() => handleAssist('counterpoint')} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600">
                  反方观点
                </button>
              </div>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="分享你的观点、分析、见解…"
              rows={16}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Source URLs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">来源链接</label>
            {sourceUrls.map((url, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="url"
                  value={url}
                  onChange={e => {
                    const next = [...sourceUrls]
                    next[i] = e.target.value
                    setSourceUrls(next)
                  }}
                  placeholder="https://..."
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                {sourceUrls.length > 1 && (
                  <button
                    onClick={() => setSourceUrls(sourceUrls.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-500 text-sm px-2"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setSourceUrls([...sourceUrls, ''])}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              + 添加来源
            </button>
          </div>

          {/* Quality indicator */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-gray-600 dark:text-gray-400">质量评分</span>
              <span className={`text-sm font-bold ${
                qualityScore >= 70 ? 'text-green-600' : qualityScore >= 40 ? 'text-yellow-600' : 'text-red-500'
              }`}>
                {qualityScore}/100
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  qualityScore >= 70 ? 'bg-green-500' : qualityScore >= 40 ? 'bg-yellow-500' : 'bg-red-400'
                }`}
                style={{ width: `${qualityScore}%` }}
              />
            </div>
            {qualityHints.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {qualityHints.map((h, i) => (
                  <div key={i} className="text-xs text-gray-400 dark:text-gray-500">💡 {h}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Agent chat panel */}
        {chatMode && (
          <div className="w-96 flex-shrink-0">
            <div className="sticky top-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">🤖 Agent 协作</h3>
                <button
                  onClick={handleChatToDraft}
                  disabled={chatMessages.length === 0}
                  className="text-xs px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-40 transition-colors"
                >
                  转为正文
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                    和 Agent 讨论你的想法，<br/>讨论完成后可一键转为正文
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-gray-100 dark:border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="和Agent讨论…"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    onKeyDown={e => { if (e.key === 'Enter') sendChat() }}
                  />
                  <button
                    onClick={sendChat}
                    disabled={!chatInput.trim()}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
