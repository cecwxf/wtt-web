'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

const CLIENT_WTT_API_BASE = '/api/wtt'

interface AgentRow {
  agent_id: string
  display_name: string
}

interface TaxonomyRes {
  prefix: string
  categories: Array<{ name: string; subs: string[] }>
}

interface ChatMsg {
  id: string
  sender_id: string
  content: string
  sender_type: string
  created_at: string
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

  // Agent chat panel — real P2P
  const [chatMode, setChatMode] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatTargetAgent, setChatTargetAgent] = useState('')
  const [chatTopicId, setChatTopicId] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken as string | undefined

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  // Derive sender identity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const senderIdentity = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = session as any
    return s?.user?.name || s?.user?.email || (s?.userId ? `user_${String(s.userId).slice(0, 8)}` : selectedAgentId || 'user')
  }, [session, selectedAgentId])

  // Poll chat messages from P2P topic via SWR
  const { data: chatMessagesRaw, mutate: mutateChat } = useSWR(
    chatTopicId && token ? ['compose-chat', chatTopicId, token] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${chatTopicId}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 3000 }
  )

  const chatMessages: ChatMsg[] = useMemo(() => {
    const raw = Array.isArray(chatMessagesRaw)
      ? chatMessagesRaw
      : Array.isArray((chatMessagesRaw as { messages?: unknown[] })?.messages)
        ? (chatMessagesRaw as { messages: unknown[] }).messages
        : []
    return raw.map((x: unknown) => {
      const m = x as Record<string, unknown>
      return {
        id: String(m.id || m.message_id || ''),
        sender_id: String(m.sender_id || ''),
        content: String(m.content || ''),
        sender_type: String(m.sender_type || ''),
        created_at: String(m.created_at || ''),
      }
    })
  }, [chatMessagesRaw])

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages.length])

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
        setAgents(list)
        if (list.length > 0 && !selectedAgentId) setSelectedAgentId(list[0].agent_id)
        if (list.length > 0 && !chatTargetAgent) setChatTargetAgent(list[0].agent_id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authHeaders])

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
    } catch (e: unknown) {
      alert(`发布失败: ${e instanceof Error ? e.message : String(e)}`)
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
    } catch { /* ignore */ }
  }

  // Send real P2P message to agent
  const sendChat = async () => {
    if (!chatInput.trim() || !chatTargetAgent || chatSending) return
    const content = chatInput.trim()
    setChatInput('')
    setChatSending(true)

    try {
      let topicId = chatTopicId

      if (!topicId) {
        // First message — create P2P topic via /messages/p2p
        const r = await fetch(`${CLIENT_WTT_API_BASE}/messages/p2p?sender_id=${encodeURIComponent(senderIdentity)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            target_agent_id: chatTargetAgent,
            content,
            content_type: 'text',
            semantic_type: 'post',
            sender_type: 'HUMAN',
          }),
        })
        if (!r.ok) {
          const errTxt = await r.text().catch(() => '')
          throw new Error(errTxt || `${r.status}`)
        }
        const res = await r.json()
        topicId = res.topic_id
        setChatTopicId(topicId)
      } else {
        // Subsequent messages — publish to existing topic
        const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            content,
            sender_id: senderIdentity,
            sender_type: 'HUMAN',
            content_type: 'text',
            semantic_type: 'post',
          }),
        })
        if (!r.ok) {
          const errTxt = await r.text().catch(() => '')
          throw new Error(errTxt || `${r.status}`)
        }
      }
      await mutateChat()
    } catch (e: unknown) {
      alert(`发送失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setChatSending(false)
    }
  }

  // Convert P2P chat history to draft body
  const handleChatToDraft = () => {
    if (chatMessages.length === 0) return
    const lines: string[] = []
    for (const msg of chatMessages) {
      const role = msg.sender_type.toUpperCase() === 'AGENT' ? '🤖 Agent' : '👤 我'
      lines.push(`**${role}**: ${msg.content}`)
    }
    const merged = lines.join('\n\n')
    setBody(prev => prev ? `${prev}\n\n---\n\n${merged}` : merged)
    if (!title && chatMessages.length > 0) {
      const first = chatMessages.find(m => m.sender_type.toUpperCase() !== 'AGENT')
      if (first) setTitle(first.content.slice(0, 60))
    }
    setChatMode(false)
  }

  // Reset P2P topic when changing target agent
  const handleChangeTarget = (agentId: string) => {
    setChatTargetAgent(agentId)
    setChatTopicId(null)
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

        {/* Right: Agent chat panel — real P2P */}
        {chatMode && (
          <div className="w-96 flex-shrink-0">
            <div className="sticky top-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">🤖 Agent 协作</h3>
                  <button
                    onClick={handleChatToDraft}
                    disabled={chatMessages.length === 0}
                    className="text-xs px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-40 transition-colors"
                  >
                    转为正文
                  </button>
                </div>
                {agents.length > 0 && (
                  <select
                    value={chatTargetAgent}
                    onChange={e => handleChangeTarget(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {agents.map(a => (
                      <option key={a.agent_id} value={a.agent_id}>
                        与 {a.display_name || a.agent_id} 协作
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && !chatTopicId && (
                  <div className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                    发送消息开始与 Agent 讨论，<br/>Agent 会通过 P2P 通道实时回复<br/>
                    <span className="text-xs mt-2 block text-gray-300 dark:text-gray-600">讨论完成后可一键「转为正文」</span>
                  </div>
                )}
                {chatMessages.length === 0 && chatTopicId && (
                  <div className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                    <div className="animate-pulse">等待 Agent 回复中…</div>
                  </div>
                )}
                {chatMessages.map((msg) => {
                  const isAgent = msg.sender_type.toUpperCase() === 'AGENT'
                  return (
                    <div key={msg.id} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                        isAgent
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                          : 'bg-blue-600 text-white'
                      }`}>
                        {isAgent && (
                          <div className="text-xs text-purple-500 dark:text-purple-400 mb-0.5 font-medium">🤖 {msg.sender_id}</div>
                        )}
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-gray-100 dark:border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder={chatTargetAgent ? `和 ${agents.find(a => a.agent_id === chatTargetAgent)?.display_name || chatTargetAgent} 讨论…` : '选择Agent后开始讨论…'}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                    disabled={!chatTargetAgent || chatSending}
                  />
                  <button
                    onClick={sendChat}
                    disabled={!chatInput.trim() || !chatTargetAgent || chatSending}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
                  >
                    {chatSending ? '…' : '发送'}
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
