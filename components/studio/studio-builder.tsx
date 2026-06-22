'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ExternalLink,
  Github,
  Globe2,
  Loader2,
  Monitor,
  PlugZap,
  RefreshCw,
  Rocket,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { ChatView, type ChatMessage, type ChatSendOptions } from '@/components/ui/chat-view'
import { StudioConnectorsPanel } from '@/components/studio/studio-connectors-panel'
import {
  fetchStudioAgentStats,
  fetchStudioAgents,
  fetchStudioCloudAgent,
  fetchStudioConnectorPromptContext,
  fetchStudioMessages,
  fetchStudioTopics,
  joinStudioTopic,
  sendStudioMessage,
} from '@/lib/studio/api'
import {
  enrichProjectWithMessages,
  projectFromTopic,
  studioTitleFromTopicName,
} from '@/lib/studio/parsers'
import {
  buildFollowupStudioPrompt,
  buildGithubPrompt,
  buildPreviewPrompt,
  buildPublishPrompt,
  studioWorkspace,
} from '@/lib/studio/prompts'
import type { StudioAgent, StudioAgentStats, StudioCloudAgent, StudioMessage, StudioProject } from '@/lib/studio/types'

function sessionToken(session: unknown) {
  return (session as { accessToken?: string } | null)?.accessToken || ''
}

function isCloudAgent(agent: StudioAgent, stats: StudioAgentStats | null) {
  const runtime = stats?.runtimes?.[agent.agent_id]
  return (
    String(agent.binding_method || agent.bound_via || '') === 'cloud_trial' ||
    Boolean(agent.is_cloud_sandbox) ||
    Boolean(agent.cloud_host_agent_id) ||
    String(runtime?.provider || '').includes('cloudflare_sandbox')
  )
}

function onlineAgentIds(stats: StudioAgentStats | null) {
  const ids = new Set((stats?.online_agents || []).map(String))
  for (const [agentId, runtime] of Object.entries(stats?.runtimes || {})) {
    if (typeof runtime.last_heartbeat_secs_ago === 'number' && runtime.last_heartbeat_secs_ago <= 90) {
      ids.add(agentId)
    }
  }
  return ids
}

function chooseStudioAgent(agents: StudioAgent[], stats: StudioAgentStats | null, cloudAgent: StudioCloudAgent | null) {
  const cloudAgents = agents.filter((agent) => isCloudAgent(agent, stats))
  const onlineIds = onlineAgentIds(stats)
  return (
    cloudAgents.find((agent) => onlineIds.has(agent.agent_id))?.agent_id ||
    String(cloudAgent?.agent_id || '').trim() ||
    cloudAgents[0]?.agent_id ||
    ''
  )
}

function toChatMessage(message: StudioMessage): ChatMessage {
  return {
    message_id: String(message.message_id || message.id || `${message.timestamp || message.created_at || ''}:${String(message.content || '').length}`),
    topic_id: message.topic_id,
    sender_id: String(message.sender_id || ''),
    sender_display_name: message.sender_display_name || undefined,
    sender_type: String(message.sender_type || '').toLowerCase() === 'human' ? 'human' : 'agent',
    content: String(message.content || ''),
    encrypted: false,
    timestamp: String(message.timestamp || message.created_at || new Date().toISOString()),
    semantic_type: String((message as { semantic_type?: string }).semantic_type || 'post'),
  }
}

function mentionTarget(agentId: string, content: string) {
  const clean = content.trim()
  if (!agentId || clean.startsWith(`@${agentId}`)) return clean
  return `@${agentId}\n${clean}`
}

export function StudioBuilder({ topicId }: { topicId: string }) {
  const { data: session, status } = useSession()
  const token = sessionToken(session)
  const [agentStats, setAgentStats] = useState<StudioAgentStats | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [project, setProject] = useState<StudioProject | null>(null)
  const [messages, setMessages] = useState<StudioMessage[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [connectorsOpen, setConnectorsOpen] = useState(false)

  const enrichedProject = useMemo(() => {
    const fallback: StudioProject = {
      topicId,
      topicName: 'STUDIO: Untitled Site',
      title: 'Untitled Site',
      description: '',
    }
    return enrichProjectWithMessages(project || fallback, messages)
  }, [messages, project, topicId])

  const chatMessages = useMemo(() => messages.map(toChatMessage), [messages])
  const selectedRuntime = selectedAgentId ? agentStats?.runtimes?.[selectedAgentId] : undefined
  const isSelectedOnline = selectedAgentId ? onlineAgentIds(agentStats).has(selectedAgentId) : false

  const refreshMessages = useCallback(async (agentId = selectedAgentId) => {
    if (!token || !agentId) return
    const loaded = await fetchStudioMessages(topicId, agentId, token)
    setMessages(loaded)
  }, [selectedAgentId, token, topicId])

  const ensureTopicMember = useCallback(async (agentId: string) => {
    if (!token || !agentId) return
    try {
      await joinStudioTopic(topicId, agentId, token)
    } catch (err) {
      // Existing Studio topics may be invite-only. If another claimed agent is
      // already OWNER/ADMIN, join succeeds; otherwise continue with current member.
      console.warn('Studio topic join skipped', err)
    }
  }, [token, topicId])

  useEffect(() => {
    if (status === 'loading') return
    if (!token) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function loadBase() {
      setLoading(true)
      setError('')
      try {
        const [cloud, agents, stats] = await Promise.all([
          fetchStudioCloudAgent(token),
          fetchStudioAgents(token).catch(() => []),
          fetchStudioAgentStats(token).catch(() => null),
        ])
        if (cancelled) return
        setAgentStats(stats)
        const chosenAgent = chooseStudioAgent(agents, stats, cloud)
        setSelectedAgentId(chosenAgent)
        if (!chosenAgent) {
          setLoading(false)
          return
        }
        const topics = await fetchStudioTopics(chosenAgent, token).catch(async () => {
          const fallbackAgent = String(cloud.agent_id || '').trim()
          return fallbackAgent && fallbackAgent !== chosenAgent ? fetchStudioTopics(fallbackAgent, token) : []
        })
        if (cancelled) return
        const found = topics.map(projectFromTopic).filter(Boolean).find((item) => item?.topicId === topicId) || null
        setProject(found || {
          topicId,
          topicName: 'STUDIO: Untitled Site',
          title: studioTitleFromTopicName('Untitled Site'),
        })
        await ensureTopicMember(chosenAgent)
        const loadedMessages = await fetchStudioMessages(topicId, chosenAgent, token)
        if (!cancelled) setMessages(loadedMessages)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load project')
          setLoading(false)
        }
      }
    }
    loadBase()
    return () => {
      cancelled = true
    }
  }, [ensureTopicMember, status, token, topicId])

  useEffect(() => {
    if (!token || !selectedAgentId) return
    const timer = window.setInterval(async () => {
      try {
        const [stats, loaded] = await Promise.all([
          fetchStudioAgentStats(token).catch(() => null),
          fetchStudioMessages(topicId, selectedAgentId, token),
        ])
        if (stats) setAgentStats(stats)
        setMessages(loaded)
      } catch {
        // Keep Studio usable during transient backend or sandbox wake delays.
      }
    }, sending ? 2500 : 5000)
    return () => window.clearInterval(timer)
  }, [selectedAgentId, sending, token, topicId])

  async function connectorContext() {
    if (!token) return ''
    return fetchStudioConnectorPromptContext(topicId, token)
      .then((data) => data.prompt_context)
      .catch(() => '')
  }

  async function submitPrompt(content: string, action: string, replyTo?: string, options?: ChatSendOptions) {
    if (!token || !selectedAgentId || sending || !content.trim()) return
    setSending(true)
    setError('')
    try {
      await ensureTopicMember(selectedAgentId)
      const shouldPassSlash = options?.slashType === 'agent_passthrough' && content.trim().startsWith('/')
      const payload = shouldPassSlash
        ? mentionTarget(selectedAgentId, content)
        : mentionTarget(selectedAgentId, content)
      await sendStudioMessage(topicId, selectedAgentId, payload, token, {
        studio_action: action,
        studio_topic_id: topicId,
        reply_to: replyTo,
        ...(options?.slashType ? { slash_type: options.slashType, slash_command: options.slashCommand || content } : {}),
      })
      await refreshMessages(selectedAgentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleChatSend = async (content: string, replyTo?: string, options?: ChatSendOptions) => {
    await submitPrompt(buildFollowupStudioPrompt(topicId, content, await connectorContext()), 'followup', replyTo, options)
  }

  if (status === 'loading' || loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0c1117] text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />
          Loading WTT Studio...
        </div>
      </main>
    )
  }

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0c1117] px-4 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-cyan-200" />
          <h1 className="mt-4 text-2xl font-semibold">Sign in to continue</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">WTT Studio reuses your existing WTT account, Cloud Agent, and billing.</p>
          <Link href={`/login?callbackUrl=/studio/projects/${encodeURIComponent(topicId)}`} className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">
            Sign in
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-[#0b1117] text-white">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#0e151d]/95 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/studio" className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{enrichedProject.title}</p>
            <p className="truncate text-xs text-slate-500">
              {selectedAgentId ? `Agent ${selectedAgentId}${isSelectedOnline ? ' · online' : ' · offline'}` : 'No Cloud Agent available'} · {studioWorkspace(topicId)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {enrichedProject.githubRepoUrl && (
            <a href={enrichedProject.githubRepoUrl} target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 sm:inline-flex">
              <Github className="h-3.5 w-3.5" />
              GitHub
            </a>
          )}
          {enrichedProject.publishedUrl && (
            <a href={enrichedProject.publishedUrl} target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-full border border-emerald-200/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-200/10 sm:inline-flex">
              <Globe2 className="h-3.5 w-3.5" />
              Published
            </a>
          )}
          <button
            type="button"
            onClick={() => setConnectorsOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-200/10"
          >
            <PlugZap className="h-3.5 w-3.5" />
            Connectors
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(460px,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-h-0 overflow-hidden border-r border-white/10 bg-[#fbfaf7] text-slate-950">
          {error && <p className="m-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p>}
          <ChatView
            topicName={enrichedProject.title}
            topicId={topicId}
            messages={chatMessages}
            currentAgentId={selectedAgentId}
            onSendMessage={handleChatSend}
            loading={loading && chatMessages.length === 0}
            wsConnected={isSelectedOnline}
            accessToken={token}
            topicType="discussion"
            compactUi
            currentAgentIsCloud
            workspaceAgentName={selectedAgentId || undefined}
            workspaceWorkdir={studioWorkspace(topicId)}
            currentAgentRuntime={{
              adapter: selectedRuntime?.adapter || 'cloud-agent',
              model: selectedRuntime?.current_model || selectedRuntime?.model_id || selectedRuntime?.model || 'studio-agent',
              reasoning_effort: selectedRuntime?.reasoning_effort || 'medium',
            }}
            agentRoleLabelMap={selectedAgentId ? { [selectedAgentId]: 'WTT Studio Agent' } : {}}
            emptyState={(
              <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-cyan-300/40 bg-cyan-50 p-5 text-left">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">WTT Studio</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Start building with your Cloud Agent</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  输入你要生成或修改的网站。Studio 会自动 @ 当前在线 Cloud Agent，并把 connector context 注入到任务中。
                </p>
              </div>
            )}
            extraHeaderActions={(
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={async () => submitPrompt(buildPreviewPrompt(topicId, await connectorContext()), 'preview')}
                  disabled={sending || !selectedAgentId}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:border-cyan-300 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={async () => submitPrompt(buildPublishPrompt(topicId, await connectorContext()), 'publish')}
                  disabled={sending || !selectedAgentId}
                  className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:border-emerald-300 disabled:opacity-50"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Publish
                </button>
                <button
                  type="button"
                  onClick={async () => submitPrompt(buildGithubPrompt(topicId, enrichedProject.title, await connectorContext()), 'github')}
                  disabled={sending || !selectedAgentId}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:border-cyan-300 disabled:opacity-50"
                >
                  <Github className="h-3.5 w-3.5" />
                  GitHub
                </button>
              </div>
            )}
          />
        </section>

        <section className="hidden min-h-0 flex-col bg-[#070b10] lg:flex">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-300/10 p-2 text-emerald-100">
                <Globe2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Live Preview</p>
                <p className="text-xs text-slate-500">{enrichedProject.previewUrl ? 'Cloud Agent Preview URL' : 'Waiting for preview URL'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDevice(device === 'desktop' ? 'mobile' : 'desktop')}
                className="rounded-full border border-white/10 p-2 text-slate-300 hover:bg-white/10"
              >
                {device === 'desktop' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              </button>
              {enrichedProject.previewUrl && (
                <a href={enrichedProject.previewUrl} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 p-2 text-slate-300 hover:bg-white/10">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-5">
            {enrichedProject.previewUrl ? (
              <div className={device === 'mobile' ? 'h-full w-[390px] max-w-full' : 'h-full w-full'}>
                <iframe
                  key={enrichedProject.previewUrl}
                  src={enrichedProject.previewUrl}
                  className="h-full min-h-[720px] w-full rounded-[1.6rem] border border-white/10 bg-white shadow-2xl"
                  title={`${enrichedProject.title} preview`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                />
              </div>
            ) : (
              <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
                <Globe2 className="mx-auto h-10 w-10 text-cyan-200" />
                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white">No preview yet</h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Ask the Agent to start a dev server and return a Cloud Agent Preview URL. The latest URL will render here automatically.
                </p>
                <button
                  type="button"
                  onClick={async () => submitPrompt(buildPreviewPrompt(topicId, await connectorContext()), 'preview')}
                  disabled={sending || !selectedAgentId}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Request preview
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
      {token && (
        <StudioConnectorsPanel
          open={connectorsOpen}
          token={token}
          projectTopicId={topicId}
          onClose={() => setConnectorsOpen(false)}
        />
      )}
    </main>
  )
}
