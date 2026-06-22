'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  Github,
  Globe2,
  Loader2,
  Monitor,
  RefreshCw,
  Rocket,
  Send,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { RichMarkdown } from '@/components/ui/rich-markdown'
import {
  fetchStudioCloudAgent,
  fetchStudioMessages,
  fetchStudioTopics,
  sendStudioMessage,
} from '@/lib/studio/api'
import {
  compactMessagePreview,
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
import type { StudioCloudAgent, StudioMessage, StudioProject } from '@/lib/studio/types'

function sessionToken(session: unknown) {
  return (session as { accessToken?: string } | null)?.accessToken || ''
}

function messageKey(message: StudioMessage, index: number) {
  return String(message.message_id || message.id || `${message.timestamp || index}-${index}`)
}

function isHuman(message: StudioMessage) {
  return String(message.sender_type || '').toLowerCase() === 'human'
}

function lastAgentActivity(messages: StudioMessage[]) {
  const agent = [...messages].reverse().find((message) => !isHuman(message) && String(message.content || '').trim())
  return agent?.content || ''
}

export function StudioBuilder({ topicId }: { topicId: string }) {
  const { data: session, status } = useSession()
  const token = sessionToken(session)
  const [cloudAgent, setCloudAgent] = useState<StudioCloudAgent | null>(null)
  const [project, setProject] = useState<StudioProject | null>(null)
  const [messages, setMessages] = useState<StudioMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const agentId = String(cloudAgent?.agent_id || '').trim()

  const enrichedProject = useMemo(() => {
    const fallback: StudioProject = {
      topicId,
      topicName: 'STUDIO: Untitled Site',
      title: 'Untitled Site',
      description: '',
    }
    return enrichProjectWithMessages(project || fallback, messages)
  }, [messages, project, topicId])

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
        const cloud = await fetchStudioCloudAgent(token)
        if (cancelled) return
        setCloudAgent(cloud)
        const aid = String(cloud.agent_id || '').trim()
        if (!aid) {
          setLoading(false)
          return
        }
        const [topics, loadedMessages] = await Promise.all([
          fetchStudioTopics(aid, token),
          fetchStudioMessages(topicId, aid, token),
        ])
        if (cancelled) return
        const found = topics.map(projectFromTopic).filter(Boolean).find((item) => item?.topicId === topicId) || null
        setProject(found || {
          topicId,
          topicName: 'STUDIO: Untitled Site',
          title: studioTitleFromTopicName('Untitled Site'),
        })
        setMessages(loadedMessages)
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
  }, [status, token, topicId])

  useEffect(() => {
    if (!token || !agentId) return
    const timer = window.setInterval(async () => {
      try {
        const loaded = await fetchStudioMessages(topicId, agentId, token)
        setMessages(loaded)
      } catch {
        // Keep Studio usable during transient backend or sandbox wake delays.
      }
    }, sending ? 2500 : 6000)
    return () => window.clearInterval(timer)
  }, [agentId, sending, token, topicId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  async function submitPrompt(content: string, action: string) {
    if (!token || !agentId || sending || !content.trim()) return
    setSending(true)
    setError('')
    try {
      await sendStudioMessage(topicId, agentId, content, token, {
        studio_action: action,
        studio_topic_id: topicId,
      })
      const loaded = await fetchStudioMessages(topicId, agentId, token)
      setMessages(loaded)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const raw = input.trim()
    if (!raw) return
    setInput('')
    await submitPrompt(buildFollowupStudioPrompt(topicId, raw), 'followup')
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
            <p className="truncate text-xs text-slate-500">{studioWorkspace(topicId)}</p>
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
          <span className="rounded-full bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100">
            {cloudAgent?.status || 'cloud-agent'}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-r border-white/10 bg-[#0f171f]">
          <div className="shrink-0 border-b border-white/10 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => submitPrompt(buildPreviewPrompt(topicId), 'preview')}
                disabled={sending || !agentId}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                type="button"
                onClick={() => submitPrompt(buildPublishPrompt(topicId), 'publish')}
                disabled={sending || !agentId}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-200/10 disabled:opacity-50"
              >
                <Rocket className="h-3.5 w-3.5" />
                Publish
              </button>
              <button
                type="button"
                onClick={() => submitPrompt(buildGithubPrompt(topicId, enrichedProject.title), 'github')}
                disabled={sending || !agentId}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                <Github className="h-3.5 w-3.5" />
                GitHub
              </button>
            </div>
            {error && <p className="mt-3 rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-100">{error}</p>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-slate-400">
                <Bot className="mb-4 h-7 w-7 text-cyan-200" />
                Project topic is ready. Ask the Agent to build the first screen, add components, or start a dev server.
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const human = isHuman(message)
                  return (
                    <article
                      key={messageKey(message, index)}
                      className={[
                        'rounded-3xl border p-4',
                        human ? 'border-cyan-200/15 bg-cyan-200/[0.06]' : 'border-white/10 bg-white/[0.045]',
                      ].join(' ')}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {human ? 'You' : 'Agent'}
                        </p>
                        <time className="text-[11px] text-slate-600">{String(message.timestamp || message.created_at || '').slice(0, 19).replace('T', ' ')}</time>
                      </div>
                      <RichMarkdown className="text-sm">{String(message.content || '')}</RichMarkdown>
                    </article>
                  )
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="shrink-0 border-t border-white/10 bg-[#0c1219] p-4">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                className="max-h-52 min-h-[92px] w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600"
                placeholder="Describe a change, e.g. make it feel more premium, add pricing, wire GitHub publish..."
              />
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-2 pt-2">
                <p className="truncate text-[11px] text-slate-500">{compactMessagePreview(lastAgentActivity(messages), 90)}</p>
                <button
                  type="submit"
                  disabled={sending || !input.trim() || !agentId}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send
                </button>
              </div>
            </div>
          </form>
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
                  onClick={() => submitPrompt(buildPreviewPrompt(topicId), 'preview')}
                  disabled={sending || !agentId}
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
    </main>
  )
}
