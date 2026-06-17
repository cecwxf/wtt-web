'use client'

import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, Camera, ClipboardCheck, FileText, MessageSquareText, RefreshCw, Save } from 'lucide-react'
import { ArenaNav } from '@/components/arena/arena-nav'
import { ChatView, type ChatMessage as FeedChatMessage, type ChatRunStatus } from '@/components/ui/chat-view'
import { CLIENT_WTT_API_BASE, WS_BASE_URL } from '@/lib/api/base-url'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import {
  applyMessageStreamEvent,
  mergePersistedMessagesWithStreaming,
  parseMessageStreamEvent,
  streamIdFromMessageRecord,
} from '@/lib/message-stream'

const ARENA_AGENT_ID = 'agent-65d869bb6fa1'

type FlowId = 'mistake-review' | 'photo-question' | 'daily-review' | 'mock-interview' | 'system-design-interview'

type FlowConfig = {
  id: FlowId
  title: string
  eyebrow: string
  subtitle: string
  domain: 'education' | 'interview'
  itemType: string
  accent: string
  icon: 'mistake' | 'photo' | 'daily' | 'mock' | 'system'
  saveLabel: string
  workflow: string[]
  promptPrefix: string
}

const flowConfigs: Record<FlowId, FlowConfig> = {
  'mistake-review': {
    id: 'mistake-review',
    title: '错题复盘',
    eyebrow: 'Mistake Review',
    subtitle: '把一道错题拆成题目信息、错因、知识点、订正路径、同类变式和复习计划。',
    domain: 'education',
    itemType: 'mistake',
    accent: 'from-amber-200 via-orange-300 to-rose-400',
    icon: 'mistake',
    saveLabel: '保存为错题',
    workflow: ['识别题目', '定位错因', '重建解法', '生成变式', '安排复习'],
    promptPrefix: '你是 WTT Arena 错题复盘 Coach。请按“题目重述 -> 错因诊断 -> 正确解法 -> 易错提醒 -> 同类变式 -> 复习计划”输出。',
  },
  'photo-question': {
    id: 'photo-question',
    title: '拍照答疑',
    eyebrow: 'Photo Question',
    subtitle: '面向图片、PDF、截图题目。第一版先记录附件信息并让 Arena Coach 进入识别和讲解流程。',
    domain: 'education',
    itemType: 'photo_question',
    accent: 'from-sky-200 via-cyan-300 to-teal-400',
    icon: 'photo',
    saveLabel: '保存为拍照题',
    workflow: ['上传题目', '识别题意', '公式/图形整理', '分步讲解', '加入错题本'],
    promptPrefix: '你是 WTT Arena 拍照答疑 Coach。请先根据用户提供的图片/文件名/OCR 文本还原题意；信息不足时明确要求用户补图或补文本；随后分步讲解并总结易错点。',
  },
  'daily-review': {
    id: 'daily-review',
    title: '每日复盘',
    eyebrow: 'Daily Review',
    subtitle: '围绕最近薄弱点生成 10-20 分钟复盘计划，并把反馈写入复习节奏。',
    domain: 'education',
    itemType: 'daily_review',
    accent: 'from-lime-200 via-emerald-300 to-green-500',
    icon: 'daily',
    saveLabel: '保存复盘计划',
    workflow: ['读取目标', '生成短练', '追踪掌握度', '安排复习', '输出明日计划'],
    promptPrefix: '你是 WTT Arena 每日复盘 Coach。请生成一个 10-20 分钟的复盘计划，包含今日目标、短练任务、检查问题、掌握度判断和下次复习建议。',
  },
  'mock-interview': {
    id: 'mock-interview',
    title: '模拟面试评分',
    eyebrow: 'Mock Interview',
    subtitle: '把你的回答当作候选人表现来评分，给出补强答案和下一轮追问。',
    domain: 'interview',
    itemType: 'interview_answer',
    accent: 'from-violet-200 via-fuchsia-300 to-pink-500',
    icon: 'mock',
    saveLabel: '保存面试复盘',
    workflow: ['提出问题', '用户回答', '0-10 评分', '补强答案', '继续追问'],
    promptPrefix: '你是 WTT Arena 面试官。请把用户回答当作候选人回答评分：先给 0-10 分，再指出亮点、缺口、误区，补一版更强答案，并给下一轮追问。',
  },
  'system-design-interview': {
    id: 'system-design-interview',
    title: '系统设计面试',
    eyebrow: 'System Design',
    subtitle: '按澄清需求、规模估算、架构、瓶颈、容灾、成本和取舍组织系统设计训练。',
    domain: 'interview',
    itemType: 'system_design_interview',
    accent: 'from-slate-200 via-blue-300 to-indigo-500',
    icon: 'system',
    saveLabel: '保存设计复盘',
    workflow: ['澄清需求', '估算规模', '设计架构', '分析瓶颈', '复盘取舍'],
    promptPrefix: '你是 WTT Arena 系统设计面试官。请按“需求澄清 -> 规模估算 -> 核心架构 -> 数据模型 -> 瓶颈与容灾 -> 成本与取舍 -> 追问”组织。',
  },
}

function iconFor(config: FlowConfig) {
  const className = 'h-6 w-6'
  if (config.icon === 'photo') return <Camera className={className} />
  if (config.icon === 'daily') return <BookOpenCheck className={className} />
  if (config.icon === 'mock') return <MessageSquareText className={className} />
  if (config.icon === 'system') return <FileText className={className} />
  return <ClipboardCheck className={className} />
}

function stripArenaFlowRuntimeContext(content: string) {
  return (content || '')
    .replace(/^┌─ 来源标识 ─+\n(?:│[^\n]*\n)?└─+\n?/, '')
    .replace(/^\[WTT Arena Flow Context\][\s\S]*?\[\/WTT Arena Flow Context\]\n*/m, '')
    .replace(/^\[WTT Arena Flow:[\s\S]*?用户输入：\n/m, '')
    .replace(/\n\n请在回答末尾给出“是否建议保存到学习档案”和“下次复习建议”。\s*$/m, '')
    .trim()
}

function topicMessagesToChat(rows: Array<Record<string, unknown>>, agentId: string): FeedChatMessage[] {
  return rows
    .filter((row) => String(row.semantic_type || '').toLowerCase() !== 'notification')
    .map((row, index) => {
      const senderType = String(row.sender_type || '').toUpperCase()
      const senderId = String(row.sender_id || '')
      const timestamp = String(row.timestamp || row.created_at || new Date().toISOString())
      return {
        message_id: String(row.id || row.message_id || `${timestamp}:${index}`),
        topic_id: String(row.topic_id || ''),
        sender_id: senderId,
        sender_type: senderType === 'AGENT' || (!!agentId && senderId === agentId) || senderId === ARENA_AGENT_ID ? 'agent' : 'human',
        sender_display_name: senderType === 'AGENT' || (!!agentId && senderId === agentId) || senderId === ARENA_AGENT_ID ? 'Arena Coach' : undefined,
        content: stripArenaFlowRuntimeContext(String(row.content || '')),
        timestamp,
        stream_id: streamIdFromMessageRecord(row) || undefined,
      }
    })
}

function localAgentMessage(content: string, agentId = ARENA_AGENT_ID): FeedChatMessage {
  const timestamp = new Date().toISOString()
  return {
    message_id: `flow-local:${timestamp}`,
    sender_id: agentId,
    sender_type: 'agent',
    content,
    timestamp,
  }
}

export default function ArenaFlowPage() {
  const params = useParams<{ flow: string }>()
  const config = flowConfigs[params.flow as FlowId]
  if (!config) notFound()

  const { data: session } = useSession()
  const token = session?.accessToken as string | undefined
  const [topicId, setTopicId] = useState('')
  const [arenaAgentId, setArenaAgentId] = useState('')
  const [messages, setMessages] = useState<FeedChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [typing, setTyping] = useState<ChatRunStatus | null>(null)

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token])

  const refreshMessages = useCallback(async (nextTopicId = topicId) => {
    if (!token || !nextTopicId) return []
    const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/messages?topic_id=${encodeURIComponent(nextTopicId)}&limit=100`, {
      headers,
      cache: 'no-store',
    })
    if (!response.ok) return []
    const data = await response.json().catch(() => ({}))
    const nextAgentId = String(data.agent_id || arenaAgentId || '')
    if (nextAgentId && nextAgentId !== arenaAgentId) setArenaAgentId(nextAgentId)
    const mapped = topicMessagesToChat(Array.isArray(data.messages) ? data.messages : [], nextAgentId)
    setMessages((prev) => mergePersistedMessagesWithStreaming(mapped, prev, nextTopicId))
    return mapped
  }, [arenaAgentId, headers, token, topicId])

  const ensureTopic = useCallback(async () => {
    if (!token) throw new Error('请先登录')
    if (topicId && arenaAgentId) return { topicId, agentId: arenaAgentId }
    const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/agent-chat/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ flow_id: config.id }),
    })
    if (!response.ok) throw new Error(await response.text())
    const data = await response.json()
    const nextTopicId = String(data.topic_id || '')
    const nextAgentId = String(data.agent_id || '')
    if (!nextTopicId) throw new Error('Arena Coach topic 创建失败')
    if (!nextAgentId) throw new Error('Arena Coach agent 创建失败')
    setTopicId(nextTopicId)
    setArenaAgentId(nextAgentId)
    await refreshMessages(nextTopicId)
    return { topicId: nextTopicId, agentId: nextAgentId }
  }, [arenaAgentId, config.id, headers, refreshMessages, token, topicId])

  useEffect(() => {
    if (token) {
      void ensureTopic().catch(() => undefined)
    }
  }, [ensureTopic, token])

  const handleWsMessage = useCallback((msg: WsMessage) => {
    const streamEvent = parseMessageStreamEvent(msg as unknown)
    if (streamEvent) {
      setMessages((prev) => applyMessageStreamEvent(prev, streamEvent, {
        topicId: topicId || undefined,
        displayName: () => 'Arena Coach',
      }))
      setTyping(null)
      return
    }
    if (msg.type === 'agent_status') {
      const raw = (msg as unknown as { status?: string; stage?: string; detail?: string }).status || (msg as unknown as { stage?: string }).stage || 'running'
      setTyping({
        agentId: arenaAgentId || ARENA_AGENT_ID,
        agentName: '我的 Cloud Agent',
        adapter: 'generic',
        model: 'arena-coach',
        wsState: 'connected',
        statusText: String(raw),
        statusKind: 'running',
        startedAt: Date.now(),
        lines: [{ id: `flow-ws-${Date.now()}`, text: String(raw), kind: 'running', ts: Date.now() }],
      })
      return
    }
    if (msg.message?.topic_id && (!topicId || msg.message.topic_id === topicId)) {
      void refreshMessages(msg.message.topic_id)
      if (msg.message.sender_id === arenaAgentId || msg.message.sender_id === ARENA_AGENT_ID || String(msg.message.sender_type || '').toUpperCase() === 'AGENT') {
        setTyping(null)
      }
    }
  }, [arenaAgentId, refreshMessages, topicId])

  const ws = useWebSocket({
    url: token && arenaAgentId ? `${WS_BASE_URL}/ws/${arenaAgentId}` : '',
    enabled: Boolean(token && arenaAgentId),
    token,
    onMessage: handleWsMessage,
  })

  async function sendFlowMessage(content: string) {
    const text = content.trim()
    if (!text || loading) return
    if (!token) {
      setMessages((prev) => [...prev, localAgentMessage('请先登录后使用 Arena Flow。', arenaAgentId || ARENA_AGENT_ID)])
      return
    }
    setLoading(true)
    setNotice('')
    try {
      const { topicId: nextTopicId, agentId: activeArenaAgentId } = await ensureTopic()
      const arenaAgentContext = [
        `[WTT Arena Flow Context]`,
        `flow_id: ${config.id}`,
        `flow_domain: ${config.domain}`,
        config.promptPrefix,
        `工作流步骤：${config.workflow.join(' -> ')}`,
        '请你自动判断学段、学科、子学科、知识点、题型、错因或面试方向；不要要求用户先选择主题/科目。',
        '如果用户消息包含图片、文件 URL 或抽取文本，请直接进行题目识别、OCR/图像理解、分步讲解；信息不足时再要求用户补充。',
        '请在回答末尾给出结构化建议：是否建议保存到学习档案、自动归类、知识点、错因/风险、下次复习建议。',
        `[/WTT Arena Flow Context]`,
      ].filter(Boolean).join('\n')
      setTyping({
        agentId: activeArenaAgentId,
        agentName: '我的 Cloud Agent',
        adapter: 'generic',
        model: 'arena-coach',
        wsState: ws.state,
        statusText: 'Arena Coach 已接收，正在处理',
        statusKind: 'running',
        startedAt: Date.now(),
        lines: [{ id: `flow-send-${Date.now()}`, text: 'Arena Coach 已接收，正在处理', kind: 'running', ts: Date.now() }],
      })
      const before = await refreshMessages(nextTopicId)
      const response = await fetch(`${CLIENT_WTT_API_BASE}/topics/${encodeURIComponent(nextTopicId)}/messages?agent_id=${encodeURIComponent(activeArenaAgentId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: text,
          content_type: 'text',
          semantic_type: 'post',
          sender_type: 'HUMAN',
          metadata: {
            arena_flow_id: config.id,
            flow_domain: config.domain,
            arena_agent_context: arenaAgentContext,
            auto_classify: true,
          },
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      await refreshMessages(nextTopicId)
      const baselineCount = before.length
      const started = Date.now()
      while (Date.now() - started < 45000) {
        await new Promise((resolve) => setTimeout(resolve, 1800))
        const latest = await refreshMessages(nextTopicId)
        if (latest.length > baselineCount && latest.some((message) => message.sender_type === 'agent')) break
      }
    } catch (error) {
      setMessages((prev) => [...prev, localAgentMessage(`Flow 执行失败：${error instanceof Error ? error.message : String(error)}`, arenaAgentId || ARENA_AGENT_ID)])
    } finally {
      setTyping(null)
      setLoading(false)
    }
  }

  async function saveLearningItem() {
    const content = messages.slice().reverse().find((message) => message.sender_type === 'human')?.content || ''
    const answer = messages.slice().reverse().find((message) => message.sender_type === 'agent')?.content || ''
    if (!token || !content.trim()) {
      setNotice(token ? '请先输入要沉淀的内容。' : '请先登录。')
      return
    }
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/learning/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          item_type: config.itemType,
          title: config.title,
          content,
          answer,
          subject: undefined,
          knowledge_points: [],
          error_reasons: config.id === 'mistake-review' ? ['待复盘错因'] : [],
          source_metadata: {
            source_type: config.id,
            flow_id: config.id,
            auto_classify: true,
          },
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      setNotice('已保存到学习档案，并生成复习计划。')
    } catch (error) {
      setNotice(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7f5f0] text-slate-950 dark:bg-[#151515] dark:text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-12rem] top-[-16rem] h-[34rem] w-[34rem] rounded-full bg-[#3ce8e2]/15 blur-3xl" />
        <div className="absolute bottom-[-18rem] right-[-12rem] h-[36rem] w-[36rem] rounded-full bg-amber-300/20 blur-3xl dark:bg-violet-500/10" />
      </div>
      <section className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-3 py-6 sm:px-5 lg:px-8">
        <ArenaNav
          title="WTT Arena Flow"
          subtitle={config.title}
          right={(
            <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-500 dark:text-gray-400">
              <Link href="/arena" className="hover:text-[#008f8f] dark:hover:text-[#3ce8e2]">返回 Arena</Link>
              <Link href="/arena/learning" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm hover:border-[#3ce8e2] dark:border-gray-800 dark:bg-[#1e1e1e] dark:text-gray-300">学习档案</Link>
            </div>
          )}
        />

        <div className="mt-6 grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b] lg:self-start">
            <div className={`h-2 bg-gradient-to-r ${config.accent}`} />
            <div className="p-4">
              <div className="flex flex-col gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#3ce8e2]/15 text-[#008f8f] dark:text-[#3ce8e2]">
                    {iconFor(config)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-gray-500">{config.eyebrow}</p>
                    <h1 className="text-xl font-black">{config.title}</h1>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-400">{config.subtitle}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void saveLearningItem()}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:border-[#3ce8e2] hover:text-[#008f8f] disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-[#111] dark:text-gray-200"
                >
                  <Save className="h-4 w-4" />
                  {saving ? '保存中...' : config.saveLabel}
                </button>
              </div>
              <div className="mt-5 grid gap-2">
                {config.workflow.map((step, index) => (
                  <span key={step} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 dark:border-gray-800 dark:bg-[#151515] dark:text-gray-300">
                    {index + 1}. {step}
                  </span>
                ))}
              </div>
              {notice && <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-800 dark:bg-[#111] dark:text-gray-300">{notice}</p>}
              <p className="mt-4 rounded-2xl border border-[#3ce8e2]/25 bg-[#efffff] px-4 py-3 text-sm leading-6 text-slate-600 dark:border-[#3ce8e2]/20 dark:bg-[#101818] dark:text-gray-300">
                直接在下方 Chat 输入题目、回答、截图或文件。Agent 会自动归类学段/学科/知识点/面试方向，并写入学习档案。
              </p>
            </div>
          </section>

          <section className="min-h-[72dvh] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/90 p-2 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e] lg:min-h-0">
            <ChatView
              topicName={`${config.title} · Arena Coach`}
              topicId={topicId || undefined}
              messages={messages}
              currentAgentId={arenaAgentId || ARENA_AGENT_ID}
              onSendMessage={sendFlowMessage}
              loading={loading && messages.length === 0}
              wsConnected={ws.state === 'connected' && Boolean(arenaAgentId)}
              accessToken={token}
              topicType="p2p"
              runStatus={typing}
              compactUi
              enableCameraCapture
              currentAgentRuntime={{ adapter: 'generic', model: 'arena-coach', reasoning_effort: 'medium' }}
              agentRoleLabelMap={arenaAgentId ? { [arenaAgentId]: '我的 Cloud Agent' } : {}}
              extraHeaderActions={(
                <button
                  type="button"
                  onClick={() => void refreshMessages()}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:border-[#3ce8e2] dark:border-gray-800 dark:bg-[#111] dark:text-gray-300"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  刷新
                </button>
              )}
              emptyState={(
                <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-[#3ce8e2]/35 bg-[#efffff] p-5 text-left dark:border-[#3ce8e2]/25 dark:bg-[#101818]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#008f8f] dark:text-[#3ce8e2]">{config.eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{config.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-gray-300">
                    这个页面是独立学习工作流，不再跳题库。直接在下方对话框输入内容，Arena Coach 会按当前 flow 的协议处理。
                  </p>
                </div>
              )}
            />
          </section>
        </div>
      </section>
    </main>
  )
}
