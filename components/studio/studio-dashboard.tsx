'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  ArrowRight,
  Bot,
  Cloud,
  Code2,
  Github,
  Globe2,
  Languages,
  Loader2,
  Lock,
  Moon,
  PlugZap,
  Plus,
  Smartphone,
  Sparkles,
  Sun,
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
import { useI18n } from '@/lib/i18n-provider'

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
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useI18n()
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
  const zh = locale === 'zh'
  const copy = zh ? {
    subtitle: '',
    feed: 'Feed',
    signIn: '登录',
    heroBadge: 'Prompt → Cloud Agent → Responsive Web/PWA → Preview URL',
    heroTitle: '和你的 WTT Cloud Agent 对话生成网站。',
    newWebsite: '新建网站',
    signInStudio: '登录 Studio',
    connectors: 'Connectors',
    manageAgents: '管理 Agent',
    workflowTitle: 'WTT Studio 工作流',
    workflowSubtitle: '从对话到可分享预览',
    cards: [
      { title: 'Prompt-first builder', desc: '输入自然语言，Agent 生成站点、组件、动画和应用原型。', Icon: Code2 },
      { title: '响应式 + PWA', desc: '新项目默认按桌面、平板、手机三档生成，并补齐 PWA-ready 基础文件。', Icon: Smartphone },
      { title: 'Live preview', desc: 'Cloud Agent 通过 Preview URL 给出全球可访问的实时预览。', Icon: Globe2 },
      { title: 'Project history', desc: '每个 Studio 项目绑定 Topic，对话、改动和链接可追溯。', Icon: Cloud },
      { title: 'App 导出', desc: '可继续让 Agent 生成 PWA 包、Android APK 或 iOS/Xcode 工程。', Icon: Github },
    ],
    projectsEyebrow: 'Projects',
    projectsTitle: '你的 Studio 网站',
    needCloudTitle: 'WTT Studio 需要 Cloud Agent。',
    needCloudDesc: '请先在 Feed 左侧创建云端 Agent，或在设置中升级并创建 Cloud Agent。Studio 会复用你的 Cloud Agent Sandbox。',
    openFeed: '打开 Feed',
    renewHint: '当前账户不是 Pro/Plus。已有 Cloud Agent 可继续查看项目；新建网站需要续费。',
    createCardTitle: '创建一个新网站',
    createCardDesc: '描述产品、用户、风格和首屏。Agent 会创建项目 Topic 并开始编码。',
    dialogEyebrow: 'New Studio Project',
    dialogTitle: 'WTT 要构建什么？',
    close: '关闭',
    projectName: '项目名称',
    firstPrompt: '第一条 Prompt',
    projectPlaceholder: 'AI 课程落地页',
    promptPlaceholder: '为……构建一个现代网站',
    createHint: '代码默认放在 Cloud Agent Sandbox 的项目目录，默认生成响应式 Web + PWA-ready；生成 Preview URL 后可在右侧预览，后续可导出 App。',
    createStart: '创建并开始',
    themeTitle: '切换明暗模式',
    langTitle: 'Switch to English',
  } : {
    subtitle: '',
    feed: 'Feed',
    signIn: 'SIGN IN',
    heroBadge: 'Prompt → Cloud Agent → Responsive Web/PWA → Preview URL',
    heroTitle: 'Build websites by talking to your WTT Cloud Agent.',
    newWebsite: 'New Website',
    signInStudio: 'Sign in to Studio',
    connectors: 'Connectors',
    manageAgents: 'Manage Agents',
    workflowTitle: 'WTT Studio workflow',
    workflowSubtitle: 'from chat to shareable preview',
    cards: [
      { title: 'Prompt-first builder', desc: 'Describe the app in natural language; Agent builds pages, components, animations, and prototypes.', Icon: Code2 },
      { title: 'Responsive + PWA', desc: 'New projects default to desktop, tablet, and mobile breakpoints with PWA-ready basics.', Icon: Smartphone },
      { title: 'Live preview', desc: 'Cloud Agent returns a globally reachable Preview URL for immediate review.', Icon: Globe2 },
      { title: 'Project history', desc: 'Every Studio project is backed by a Topic, so conversation, changes, and links remain traceable.', Icon: Cloud },
      { title: 'App export', desc: 'Ask the Agent to generate a PWA package, Android APK, or iOS/Xcode project from the same codebase.', Icon: Github },
    ],
    projectsEyebrow: 'Projects',
    projectsTitle: 'Your Studio websites',
    needCloudTitle: 'WTT Studio needs a Cloud Agent.',
    needCloudDesc: 'Create a Cloud Agent from Feed or upgrade in Settings. Studio reuses your Cloud Agent Sandbox.',
    openFeed: 'Open Feed',
    renewHint: 'This account is not Pro/Plus. Existing Cloud Agent projects can be viewed; creating new websites requires renewal.',
    createCardTitle: 'Create a new website',
    createCardDesc: 'Describe the product, audience, style, and first screen. Agent will create the project Topic and start coding.',
    dialogEyebrow: 'New Studio Project',
    dialogTitle: 'What should WTT build?',
    close: 'Close',
    projectName: 'Project name',
    firstPrompt: 'First prompt',
    projectPlaceholder: 'AI course landing page',
    promptPlaceholder: 'Build a modern landing page for...',
    createHint: 'Code is stored in the Cloud Agent Sandbox project directory. Projects default to responsive Web + PWA-ready output, with App export available later.',
    createStart: 'Create and start',
    themeTitle: 'Toggle light/dark mode',
    langTitle: '切换为中文',
  }

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
    <main className="min-h-screen overflow-hidden bg-[#f6f1e8] text-slate-950 dark:bg-[#0b1117] dark:text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-12%] top-[-10%] h-[440px] w-[440px] rounded-full bg-cyan-300/35 blur-3xl dark:bg-cyan-400/20" />
        <div className="absolute right-[-10%] top-[20%] h-[460px] w-[460px] rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-300/16" />
        <div className="absolute bottom-[-18%] left-[24%] h-[560px] w-[560px] rounded-full bg-orange-200/45 blur-3xl dark:bg-orange-300/10" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <WttLogo className="h-9 w-9" />
            <div>
              <p className="text-sm font-semibold tracking-[0.22em] text-cyan-700 dark:text-cyan-100/70">WTT STUDIO</p>
              {copy.subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{copy.subtitle}</p>}
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/feed" className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-transparent dark:text-slate-200 dark:hover:border-white/30 dark:hover:bg-white/10">
              {copy.feed}
            </Link>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="inline-flex rounded-full border border-slate-200 bg-white/70 p-2 text-slate-600 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              title={copy.themeTitle}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setLocale(zh ? 'en' : 'zh')}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              title={copy.langTitle}
            >
              <Languages className="h-3.5 w-3.5" />
              {zh ? '中' : 'EN'}
            </button>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100">
              {token ? planLabel : copy.signIn}
            </span>
          </div>
        </header>

        <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-100 px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              {copy.heroBadge}
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.06em] text-slate-950 dark:text-white sm:text-6xl">
              {copy.heroTitle}
            </h1>
            <div className="mt-7 flex flex-wrap gap-3">
              {token ? (
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_20px_80px_rgba(15,23,42,0.18)] transition hover:scale-[1.02] dark:bg-white dark:text-slate-950 dark:shadow-[0_20px_80px_rgba(255,255,255,0.22)]"
                >
                  <Plus className="h-4 w-4" />
                  {copy.newWebsite}
                </button>
              ) : (
                <Link href="/login?callbackUrl=/studio" className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_20px_80px_rgba(15,23,42,0.18)] transition hover:scale-[1.02] dark:bg-white dark:text-slate-950 dark:shadow-[0_20px_80px_rgba(255,255,255,0.22)]">
                  {copy.signInStudio}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              {token && (
                <button
                  type="button"
                  onClick={() => setConnectorsOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-white/40 px-5 py-3 text-sm font-semibold text-cyan-700 transition hover:border-cyan-600/30 hover:bg-white/80 dark:border-cyan-200/20 dark:bg-transparent dark:text-cyan-100 dark:hover:border-cyan-100/40 dark:hover:bg-cyan-200/10"
                >
                  <PlugZap className="h-4 w-4" />
                  {copy.connectors}
                </button>
              )}
              <Link href="/feed" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/40 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white/80 dark:border-white/15 dark:bg-transparent dark:text-slate-100 dark:hover:border-white/30 dark:hover:bg-white/10">
                {copy.manageAgents}
                <Bot className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/55 p-3 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-white/[0.06]">
            <div className="rounded-[1.6rem] border border-slate-200 bg-white/85 p-5 dark:border-white/10 dark:bg-[#101820]/90">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">{copy.workflowTitle}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{copy.workflowSubtitle}</p>
                </div>
                <Wand2 className="h-5 w-5 text-cyan-600 dark:text-cyan-200" />
              </div>
              <div className="mt-5 grid gap-3">
                {copy.cards.map(({ title, desc, Icon }) => (
                  <div key={title} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.05]">
                    <div className="flex items-start gap-3">
                      <span className="rounded-xl bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-200/10 dark:text-cyan-100">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{desc}</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{copy.projectsEyebrow}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{copy.projectsTitle}</h2>
            </div>
            {loadState === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />}
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-300/40 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-300/20 dark:bg-red-400/10 dark:text-red-100">
              {error}
            </div>
          )}

          {token && !agentId && loadState === 'ready' && (
            <div className="rounded-3xl border border-amber-300/50 bg-amber-50 p-6 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-50">
              <div className="flex items-start gap-3">
                <Lock className="mt-1 h-5 w-5" />
                <div>
                  <p className="font-semibold">{copy.needCloudTitle}</p>
                  <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-100/80">{copy.needCloudDesc}</p>
                  <Link href="/feed" className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-sm font-bold text-amber-50 dark:bg-amber-100 dark:text-amber-950">
                    {copy.openFeed}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {token && agentId && !paid && (
            <div className="mb-4 rounded-2xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
              {copy.renewHint}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.topicId}
                href={`/studio/projects/${encodeURIComponent(project.topicId)}`}
                className="group rounded-3xl border border-slate-200 bg-white/70 p-5 transition hover:-translate-y-1 hover:border-cyan-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:hover:border-cyan-200/35 dark:hover:bg-white/[0.09]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">{project.title}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{compactMessagePreview(project.lastMessage)}</p>
                  </div>
                  <span className="rounded-full bg-cyan-100 p-2 text-cyan-700 transition group-hover:bg-cyan-200 dark:bg-cyan-200/10 dark:text-cyan-100 dark:group-hover:bg-cyan-200/20">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {project.previewUrl && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-100">Preview</span>}
                  {project.githubRepoUrl && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-white/10 dark:text-slate-200">GitHub</span>}
                </div>
              </Link>
            ))}

            {token && agentId && (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="min-h-[180px] rounded-3xl border border-dashed border-slate-300 bg-white/45 p-5 text-left transition hover:border-cyan-400 hover:bg-white/75 dark:border-white/18 dark:bg-white/[0.035] dark:hover:border-cyan-200/40 dark:hover:bg-cyan-200/[0.06]"
              >
                <span className="inline-flex rounded-2xl bg-slate-950 px-3 py-3 text-white dark:bg-white dark:text-slate-950">
                  <Plus className="h-5 w-5" />
                </span>
                <p className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">{copy.createCardTitle}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{copy.createCardDesc}</p>
              </button>
            )}
          </div>
        </section>
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl dark:border-white/10 dark:bg-[#111a22] dark:text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-100/70">{copy.dialogEyebrow}</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">{copy.dialogTitle}</h3>
              </div>
              <button type="button" onClick={() => setDialogOpen(false)} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">
                {copy.close}
              </button>
            </div>
            <label className="mt-6 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              {copy.projectName}
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-cyan-200/60"
                placeholder={copy.projectPlaceholder}
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              {copy.firstPrompt}
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="mt-2 min-h-[160px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-cyan-200/60"
                placeholder={copy.promptPlaceholder}
              />
            </label>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                {copy.createHint}
              </p>
              <button
                type="submit"
                disabled={!canCreate}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {copy.createStart}
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
