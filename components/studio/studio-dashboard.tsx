'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Cloud,
  Code2,
  Github,
  Globe2,
  Loader2,
  Lock,
  PlugZap,
  Plus,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { WttLogo } from '@/components/ui/wtt-logo'
import { StudioConnectorsPanel } from '@/components/studio/studio-connectors-panel'
import {
  createStudioTopic,
  fetchStudioBilling,
  fetchStudioCloudAgent,
  fetchStudioConnectorPromptContext,
  fetchStudioMessages,
  fetchStudioTopics,
  sendStudioMessage,
} from '@/lib/studio/api'
import { buildInitialStudioPrompt } from '@/lib/studio/prompts'
import { compactMessagePreview, enrichProjectWithMessages, projectFromTopic } from '@/lib/studio/parsers'
import type { StudioBilling, StudioCloudAgent, StudioProject } from '@/lib/studio/types'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function sessionToken(session: unknown) {
  return (session as { accessToken?: string } | null)?.accessToken || ''
}

function isPaidPlan(billing: StudioBilling | null, cloudAgent: StudioCloudAgent | null) {
  const plan = String(billing?.entitlement?.plan || billing?.active_plan || billing?.plan || '').toLowerCase()
  return plan === 'pro' || plan === 'plus' || Boolean(cloudAgent?.has_cloud_agent)
}

function cloudAgentId(cloudAgent: StudioCloudAgent | null) {
  return String(cloudAgent?.agent_id || '').trim()
}

export function StudioDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const token = sessionToken(session)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [billing, setBilling] = useState<StudioBilling | null>(null)
  const [cloudAgent, setCloudAgent] = useState<StudioCloudAgent | null>(null)
  const [projects, setProjects] = useState<StudioProject[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [connectorsOpen, setConnectorsOpen] = useState(false)

  const agentId = cloudAgentId(cloudAgent)
  const paid = isPaidPlan(billing, cloudAgent)
  const canCreate = Boolean(token && paid && agentId && !creating)

  useEffect(() => {
    if (status === 'loading') return
    if (!token) {
      setLoadState('ready')
      return
    }
    let cancelled = false
    async function load() {
      setLoadState('loading')
      setError('')
      try {
        const [billingData, cloudData] = await Promise.all([
          fetchStudioBilling(token).catch(() => null),
          fetchStudioCloudAgent(token),
        ])
        if (cancelled) return
        setBilling(billingData)
        setCloudAgent(cloudData)
        const aid = cloudAgentId(cloudData)
        if (!aid) {
          setProjects([])
          setLoadState('ready')
          return
        }
        const topics = await fetchStudioTopics(aid, token)
        if (cancelled) return
        const baseProjects = topics.map(projectFromTopic).filter(Boolean) as StudioProject[]
        const withLinks = await Promise.all(
          baseProjects.slice(0, 12).map(async (project) => {
            try {
              const messages = await fetchStudioMessages(project.topicId, aid, token)
              return enrichProjectWithMessages(project, messages)
            } catch {
              return project
            }
          }),
        )
        const byId = new Map(withLinks.map((project) => [project.topicId, project]))
        const merged = baseProjects.map((project) => byId.get(project.topicId) || project)
        setProjects(
          merged.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
        )
        setLoadState('ready')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load WTT Studio')
          setLoadState('error')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [status, token])

  const planLabel = useMemo(() => {
    const plan = String(billing?.entitlement?.plan || billing?.active_plan || billing?.plan || 'free').toUpperCase()
    return plan || 'FREE'
  }, [billing])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) return
    const title = projectName.trim() || 'Untitled Site'
    setCreating(true)
    setError('')
    try {
      const topic = await createStudioTopic(agentId, title, token)
      const topicId = String(topic.topic_id || topic.id || '').trim()
      if (!topicId) throw new Error('Studio topic was created without topic_id')
      const userPrompt = prompt.trim() || `创建网站：${title}`
      const connectorContext = await fetchStudioConnectorPromptContext(topicId, token)
        .then((data) => data.prompt_context)
        .catch(() => '')
      await sendStudioMessage(
        topicId,
        agentId,
        buildInitialStudioPrompt({
            projectName: title,
            topicId,
            userPrompt,
            connectorContext,
          }),
        token,
        { studio_action: 'create_project', project_name: title, display_content: userPrompt },
      )
      router.push(`/studio/projects/${encodeURIComponent(topicId)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#0b1117] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-12%] top-[-10%] h-[440px] w-[440px] rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-[-10%] top-[20%] h-[460px] w-[460px] rounded-full bg-emerald-300/16 blur-3xl" />
        <div className="absolute bottom-[-18%] left-[24%] h-[560px] w-[560px] rounded-full bg-orange-300/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <WttLogo className="h-9 w-9" />
            <div>
              <p className="text-sm font-semibold tracking-[0.22em] text-cyan-100/70">WTT STUDIO</p>
              <p className="text-xs text-slate-400">Lovable-style site builder on Agent Fabric</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/feed" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-white/30 hover:bg-white/10">
              Feed
            </Link>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100">
              {token ? planLabel : 'SIGN IN'}
            </span>
          </div>
        </header>

        <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Prompt → Cloud Agent → Preview URL → GitHub
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.06em] text-white sm:text-6xl">
              Build websites by talking to your WTT Cloud Agent.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              WTT Studio 复用现有 WTT 登录、会员、Cloud Agent、Topic 和 Preview URL。每个项目就是一个 Topic，代码运行在你的 Cloudflare Sandbox，生成后直接通过 Preview URL 预览，并可提交到 GitHub。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {token ? (
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_20px_80px_rgba(255,255,255,0.22)] transition hover:scale-[1.02]"
                >
                  <Plus className="h-4 w-4" />
                  New Website
                </button>
              ) : (
                <Link href="/login?callbackUrl=/studio" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_20px_80px_rgba(255,255,255,0.22)] transition hover:scale-[1.02]">
                  Sign in to Studio
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              {token && (
                <button
                  type="button"
                  onClick={() => setConnectorsOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-100/40 hover:bg-cyan-200/10"
                >
                  <PlugZap className="h-4 w-4" />
                  Connectors
                </button>
              )}
              <Link href="/feed" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/10">
                Manage Agents
                <Bot className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-2xl backdrop-blur">
            <div className="rounded-[1.6rem] border border-white/10 bg-[#101820]/90 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Loveable-style workflow</p>
                  <p className="text-xs text-slate-400">summarized for WTT Studio</p>
                </div>
                <Wand2 className="h-5 w-5 text-cyan-200" />
              </div>
              <div className="mt-5 grid gap-3">
                {[
                  { title: 'Prompt-first builder', desc: '输入自然语言，Agent 生成站点、组件、动画和应用原型。', Icon: Code2 },
                  { title: 'Live preview', desc: 'Cloud Agent 通过 Preview URL 给出全球可访问的实时预览。', Icon: Globe2 },
                  { title: 'Project history', desc: '每个 Studio 项目绑定 Topic，对话、改动和链接可追溯。', Icon: Cloud },
                  { title: 'GitHub handoff', desc: '需要版本管理时，Agent 可把项目提交到你的 GitHub 仓库。', Icon: Github },
                ].map(({ title, desc, Icon }) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                    <div className="flex items-start gap-3">
                      <span className="rounded-xl bg-cyan-200/10 p-2 text-cyan-100">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Projects</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-white">Your Studio websites</h2>
            </div>
            {loadState === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />}
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {token && !agentId && loadState === 'ready' && (
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-6 text-amber-50">
              <div className="flex items-start gap-3">
                <Lock className="mt-1 h-5 w-5" />
                <div>
                  <p className="font-semibold">WTT Studio needs a Cloud Agent.</p>
                  <p className="mt-1 text-sm leading-6 text-amber-100/80">请先在 Feed 左侧创建云端 Agent，或在设置中升级并创建 Cloud Agent。Studio 会复用你的 Cloud Agent Sandbox。</p>
                  <Link href="/feed" className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-950">
                    Open Feed
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {token && agentId && !paid && (
            <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              当前账户不是 Pro/Plus。已有 Cloud Agent 可继续查看项目；新建网站需要续费。
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.topicId}
                href={`/studio/projects/${encodeURIComponent(project.topicId)}`}
                className="group rounded-3xl border border-white/10 bg-white/[0.06] p-5 transition hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-white/[0.09]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold tracking-[-0.02em] text-white">{project.title}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{compactMessagePreview(project.lastMessage)}</p>
                  </div>
                  <span className="rounded-full bg-cyan-200/10 p-2 text-cyan-100 transition group-hover:bg-cyan-200/20">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {project.previewUrl && <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-emerald-100">Preview</span>}
                  {project.githubRepoUrl && <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200">GitHub</span>}
                </div>
              </Link>
            ))}

            {token && agentId && (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="min-h-[180px] rounded-3xl border border-dashed border-white/18 bg-white/[0.035] p-5 text-left transition hover:border-cyan-200/40 hover:bg-cyan-200/[0.06]"
              >
                <span className="inline-flex rounded-2xl bg-white px-3 py-3 text-slate-950">
                  <Plus className="h-5 w-5" />
                </span>
                <p className="mt-4 text-lg font-semibold text-white">Create a new website</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">Describe the product, audience, style, and first screen. Agent will create the project topic and start coding.</p>
              </button>
            )}
          </div>
        </section>
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#111a22] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">New Studio Project</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">What should WTT build?</h3>
              </div>
              <button type="button" onClick={() => setDialogOpen(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">
                Close
              </button>
            </div>
            <label className="mt-6 block text-sm font-semibold text-slate-200">
              Project name
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/60"
                placeholder="AI course landing page"
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-200">
              First prompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="mt-2 min-h-[160px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/60"
                placeholder="Build a modern landing page for..."
              />
            </label>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-slate-400">
                代码默认放在 Cloud Agent Sandbox 的项目目录，生成 Preview URL 后可在右侧预览。
              </p>
              <button
                type="submit"
                disabled={!canCreate}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Create and start
              </button>
            </div>
          </form>
        </div>
      )}
      {token && (
        <StudioConnectorsPanel
          open={connectorsOpen}
          token={token}
          onClose={() => setConnectorsOpen(false)}
        />
      )}
    </main>
  )
}
