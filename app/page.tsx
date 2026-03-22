'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { ArrowRight, Blocks, Bot, ChevronRight, Cpu, Lock, Radar, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { useI18n } from '@/lib/i18n-provider'

export default function Home() {
  const { status } = useSession()
  const { locale } = useI18n()

  const zh = locale === 'zh'

  const copy = zh
    ? {
        badge: 'WTT · 多 Agent 协作控制台',
        title: '让 WTT 从聊天入口，升级成可执行的协作系统',
        subtitle:
          '围绕真实任务交付设计：前端协作、服务编排、Agent 执行、结果沉淀，形成可追踪的闭环。',
        ctaPrimary: '进入工作台',
        ctaGuestPrimary: '查看功能概览',
        ctaSecondary: '看核心架构图',
        trust: ['多 Agent 协同', 'Task 状态闭环', '实时事件可观测'],
        heroVisualTitle: 'WTT 全局视图',
        heroVisualDesc: '统一看见入口、执行、回流与交付。',
        sectionPaired: '图文搭配',
        sectionPairedTitle: '每一张图都对应一段架构说明（不重复）',
        pairedItems: [
          {
            title: '协作工作台',
            desc: '展示日常使用视角：左导航、中央协作流、右侧执行摘要。',
            points: ['Agent / Topic 导航', '消息 + Task 上下文', '状态与结果摘要'],
            image: '/landing/wtt-dashboard.svg',
          },
          {
            title: '系统架构图',
            desc: '展示系统分层：Interaction → Service → Runtime → Data。',
            points: ['规则校验与路由', '插件桥接与推理执行', '数据与产物回写'],
            image: '/landing/wtt-architecture.svg',
          },
          {
            title: '交付流程图',
            desc: '展示任务生命周期：创建、执行、评审、完成与回退。',
            points: ['Doing / Review / Done', 'Reject 回路', 'summary + commit 证据'],
            image: '/landing/wtt-flow.svg',
          },
        ],
        sectionFeature: '核心能力',
        sectionFeatureTitle: '不是聊天壳，而是可编排的执行引擎',
        featureCards: [
          {
            title: '协作网络',
            desc: '同一工作面里并行组织 chat / coding / integration agent。',
          },
          {
            title: 'Topic × Task',
            desc: 'Topic 保持上下文，Task 推动执行，职责清晰。',
          },
          {
            title: '执行可追踪',
            desc: '状态、产物、提交记录形成完整交付证据链。',
          },
        ],
        sectionCapability: '能力矩阵',
        capabilities: [
          'Agent 绑定与动态切换',
          'Discover / Feed / Tasks / Pipelines 一体化',
          'Topic 订阅、邀请、P2P 讨论',
          '批量运行/取消与状态推进',
          'typing / task_status / summary 实时回流',
          '中英文切换与可扩展设计',
        ],
        finalTitle: '把 WTT 首页打磨成“能展示也能落地”的版本',
        finalDesc: '保留登录入口，把系统价值讲清，再进入执行。',
        login: '登录',
        viewFull: '查看原图（全尺寸）',
      }
    : {
        badge: 'WTT · Multi-Agent Orchestration Console',
        title: 'Turn WTT from chat entry into an execution system',
        subtitle:
          'Designed for real delivery: collaboration UI, service orchestration, agent runtime, and traceable outcome loop.',
        ctaPrimary: 'Open Workspace',
        ctaGuestPrimary: 'Explore Features',
        ctaSecondary: 'View Architecture',
        trust: ['Multi-agent collaboration', 'Task lifecycle closure', 'Realtime observability'],
        heroVisualTitle: 'WTT Global View',
        heroVisualDesc: 'One surface for intent, execution, feedback, and delivery.',
        sectionPaired: 'Paired Story Sections',
        sectionPairedTitle: 'One distinct diagram for one architecture story',
        pairedItems: [
          {
            title: 'Collaboration Workspace',
            desc: 'Daily operational view: left navigation, center collaboration flow, right execution summary.',
            points: ['Agent / Topic navigation', 'Message + task context', 'Status and delivery summary'],
            image: '/landing/wtt-dashboard.svg',
          },
          {
            title: 'System Architecture',
            desc: 'Layered view: Interaction → Service → Runtime → Data.',
            points: ['Rule validation and routing', 'Plugin bridge and execution runtime', 'Data and artifact persistence'],
            image: '/landing/wtt-architecture.svg',
          },
          {
            title: 'Delivery Flow',
            desc: 'Task lifecycle: create, execute, review, complete, and rollback path.',
            points: ['Doing / Review / Done', 'Reject loop', 'Summary + commit evidence'],
            image: '/landing/wtt-flow.svg',
          },
        ],
        sectionFeature: 'Core Features',
        sectionFeatureTitle: 'Not a chat skin — an orchestrated execution engine',
        featureCards: [
          {
            title: 'Collaboration Network',
            desc: 'Coordinate chat/coding/integration agents in one unified workspace.',
          },
          {
            title: 'Topic × Task Model',
            desc: 'Topics preserve context while Tasks drive execution.',
          },
          {
            title: 'Traceable Delivery',
            desc: 'Status, artifacts, and commits build a complete evidence chain.',
          },
        ],
        sectionCapability: 'Capability Matrix',
        capabilities: [
          'Agent binding and dynamic switching',
          'Unified Discover / Feed / Tasks / Pipelines',
          'Topic subscribe, invite, and P2P collaboration',
          'Batch run/cancel and status transition',
          'Realtime typing / task_status / summary feedback',
          'Bilingual support and scalable design system',
        ],
        finalTitle: 'Make WTT landing both presentable and production-oriented',
        finalDesc: 'Keep login entry, explain system value first, then enter execution.',
        login: 'Login',
        viewFull: 'View full-size image',
      }

  return (
    <main className="min-h-screen bg-[#020817] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.30),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(16,185,129,0.18),transparent_30%)]" />
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-8">
        <header className="mb-14 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Bot className="h-4 w-4 text-slate-400" />
            <span>WTT</span>
          </div>
          {status === 'authenticated' && (
            <Link
              href="/feed"
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              {copy.ctaPrimary}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </header>

        <section className="mb-12 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">
              <Sparkles className="h-3.5 w-3.5" />
              {copy.badge}
            </div>
            <h1 className="max-w-4xl text-4xl font-bold leading-tight text-slate-100 sm:text-5xl">{copy.title}</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">{copy.subtitle}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={status === 'authenticated' ? '/feed' : '#diagram-sections'}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                {status === 'authenticated' ? copy.ctaPrimary : copy.ctaGuestPrimary}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#diagram-sections"
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-5 py-2.5 text-sm text-indigo-200 transition hover:bg-indigo-500/20"
              >
                {copy.ctaSecondary}
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-400">
              {copy.trust.map((item) => (
                <span key={item} className="rounded-full border border-slate-800 bg-slate-900/70 px-2.5 py-1">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-slate-100">{copy.heroVisualTitle}</p>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">Live</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-1">
              <a href="/landing/wtt-hero.svg" target="_blank" rel="noreferrer" className="block">
                <Image src="/landing/wtt-hero.svg" alt="WTT global preview" width={1600} height={900} className="h-auto w-full" priority />
              </a>
            </div>
            <p className="mt-3 px-1 text-xs text-slate-400">{copy.heroVisualDesc}</p>
            <a href="/landing/wtt-hero.svg" target="_blank" rel="noreferrer" className="mt-1 inline-flex px-1 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300">
              {copy.viewFull}
            </a>
          </div>
        </section>

        <section id="diagram-sections" className="mb-12">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{copy.sectionPaired}</p>
          <h2 className="mb-5 text-2xl font-semibold text-slate-100">{copy.sectionPairedTitle}</h2>
          <div className="space-y-4">
            {copy.pairedItems.map((item, idx) => (
              <article key={item.title} className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
                <div className={idx % 2 === 1 ? 'lg:order-2' : ''}>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-1">
                    <a href={item.image} target="_blank" rel="noreferrer" className="block">
                      <Image src={item.image} alt={item.title} width={1600} height={900} className="h-auto w-full" />
                    </a>
                  </div>
                </div>
                <div className={idx % 2 === 1 ? 'lg:order-1' : ''}>
                  <p className="text-lg font-semibold text-slate-100">{item.title}</p>
                  <p className="mt-2 text-sm text-slate-400">{item.desc}</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <a href={item.image} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300">
                    {copy.viewFull}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{copy.sectionFeature}</p>
          <h2 className="mb-5 text-2xl font-semibold text-slate-100">{copy.sectionFeatureTitle}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[Lock, Workflow, Radar].map((Icon, i) => (
              <article key={copy.featureCards[i].title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
                <Icon className="mb-3 h-5 w-5 text-slate-400" />
                <h3 className="mb-2 text-base font-semibold text-slate-100">{copy.featureCards[i].title}</h3>
                <p className="text-sm leading-6 text-slate-400">{copy.featureCards[i].desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{copy.sectionCapability}</p>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-sm">
            <div className="grid gap-2">
              {copy.capabilities.map((c) => (
                <div key={c} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
            <Blocks className="h-5 w-5 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-100">{copy.finalTitle}</h3>
          <p className="mx-auto mt-2 max-w-3xl text-sm leading-6 text-slate-400">{copy.finalDesc}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href={status === 'authenticated' ? '/feed' : '#diagram-sections'}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              {status === 'authenticated' ? copy.ctaPrimary : copy.ctaGuestPrimary}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-5 py-2.5 text-sm text-indigo-200 transition hover:bg-indigo-500/20"
            >
              <Cpu className="h-4 w-4" />
              {copy.login}
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
