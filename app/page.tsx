'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ArrowRight, Blocks, Bot, Cable, ChevronRight, Cpu, Lock, Radar, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { useI18n } from '@/lib/i18n-provider'

export default function Home() {
  const { status } = useSession()
  const { locale } = useI18n()

  const zh = locale === 'zh'

  const copy = zh
    ? {
        badge: 'WTT Web · 多 Agent 协作控制台',
        title: '把 Agent 对话升级成可编排的工作系统',
        subtitle:
          '参考 BotsChat 首页的叙事方式，我们把 WTT 的核心能力完整呈现：Agent 编排、Topic 协同、Task 生命周期、Runner 执行与可追踪观测。',
        ctaPrimary: status === 'authenticated' ? '进入工作台' : '登录并开始',
        ctaSecondary: '查看架构总览',
        trust: ['多 Agent 协同', 'Topic / Task 双轨', '可观测执行流'],
        sectionFeature: '核心能力',
        sectionFeatureTitle: 'WTT 的功能不是聊天壳，而是任务编排引擎',
        featureCards: [
          {
            title: 'Agent 协作网络',
            desc: '把 chat agent、coding agent、测试集成 agent 放在同一工作面，支持并行协同与状态同步。',
          },
          {
            title: 'Topic × Task 双层结构',
            desc: 'Topic 负责沟通上下文，Task 负责执行闭环；讨论不丢，执行可追踪。',
          },
          {
            title: '可视化执行与审阅',
            desc: '支持 Doing/Review/Done 生命周期，配合状态消息、结果回放与代码提交回溯。',
          },
        ],
        sectionArch: '架构视图',
        sectionArchTitle: '体现 WTT 架构：从意图到执行的完整链路',
        archNodes: [
          { title: 'Intent', desc: '用户意图 / 消息输入' },
          { title: 'Topic', desc: '会话路由与协作上下文' },
          { title: 'Task', desc: '结构化任务与状态机' },
          { title: 'Runner', desc: 'Agent 执行与结果产出' },
        ],
        sectionFlow: '执行流',
        sectionFlowTitle: '三步完成一次可靠交付',
        flow: [
          { step: '01', title: '创建任务并分配 Agent', desc: '支持代码/研究/通用任务，明确 owner 与 runner。' },
          { step: '02', title: '推理执行 + 状态回传', desc: '执行过程持续回传，支持 review / reject / rerun。' },
          { step: '03', title: '结果沉淀与追踪', desc: '把交付结果、链接、提交记录收敛到统一工作面板。' },
        ],
        sectionCapability: '能力矩阵',
        capabilities: [
          'Agent 绑定与动态切换',
          'Discover / Feed / Tasks / Pipelines 一体化',
          'Topic 订阅、邀请、P2P 讨论',
          '任务批量运行、批量取消、状态推进',
          '消息时间线与附件扩展',
          '中英文切换与可持续主题扩展',
        ],
        finalTitle: '准备好把 WTT-Web 升级成“可演示 + 可生产”的首页了吗？',
        finalDesc: '登录入口保留，同时首页承担产品叙事：先看懂架构，再进入执行。',
        login: '登录',
      }
    : {
        badge: 'WTT Web · Multi-Agent Orchestration Console',
        title: 'Turn AI chat into an orchestrated delivery system',
        subtitle:
          'Inspired by BotsChat’s homepage storytelling, this WTT landing highlights the full system: agent orchestration, topic collaboration, task lifecycle, runner execution, and observability.',
        ctaPrimary: status === 'authenticated' ? 'Open Workspace' : 'Login to Start',
        ctaSecondary: 'View Architecture',
        trust: ['Multi-agent collaboration', 'Topic + Task dual rails', 'Observable execution flow'],
        sectionFeature: 'Core Features',
        sectionFeatureTitle: 'WTT is not just chat UI — it is an execution orchestration layer',
        featureCards: [
          {
            title: 'Agent Collaboration Network',
            desc: 'Run chat, coding, and integration/testing agents in one coordinated workspace with synced progress.',
          },
          {
            title: 'Topic × Task Dual Structure',
            desc: 'Topics preserve context while Tasks ensure execution closure and accountability.',
          },
          {
            title: 'Visual Execution & Review',
            desc: 'Track Doing/Review/Done lifecycle with traceable updates, results, and commit references.',
          },
        ],
        sectionArch: 'Architecture',
        sectionArchTitle: 'WTT pipeline from intent to execution',
        archNodes: [
          { title: 'Intent', desc: 'User intent / input message' },
          { title: 'Topic', desc: 'Routing + collaboration context' },
          { title: 'Task', desc: 'Structured task + state machine' },
          { title: 'Runner', desc: 'Agent execution + outcomes' },
        ],
        sectionFlow: 'Execution Flow',
        sectionFlowTitle: 'Three steps to reliable delivery',
        flow: [
          { step: '01', title: 'Create task & assign agent', desc: 'Code/Research/General tasks with clear owner and runner.' },
          { step: '02', title: 'Reasoning + status feedback', desc: 'Continuous status updates with review / reject / rerun support.' },
          { step: '03', title: 'Result consolidation', desc: 'Collect deliverables, links, and commit traces in one control surface.' },
        ],
        sectionCapability: 'Capability Matrix',
        capabilities: [
          'Agent binding and live switching',
          'Unified Discover / Feed / Tasks / Pipelines',
          'Topic subscribe, invite, and P2P collaboration',
          'Batch run/cancel and state-driven task operations',
          'Timeline-style messages and attachment expansion',
          'Bilingual language switch and extensible design system',
        ],
        finalTitle: 'Ready to turn WTT-Web into a product-grade landing experience?',
        finalDesc: 'Keep login intact, and let the homepage explain architecture before users enter execution.',
        login: 'Login',
      }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.35),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(16,185,129,0.2),transparent_30%)]" />
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-8">
        <header className="mb-16 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <Bot className="h-4 w-4 text-indigo-300" />
            <span>WTT-Web</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={status === 'authenticated' ? '/feed' : '/login'}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400"
            >
              {copy.login}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        <section className="mb-14">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-300/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">
            <Sparkles className="h-3.5 w-3.5" />
            {copy.badge}
          </div>
          <h1 className="max-w-4xl text-4xl font-bold leading-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">{copy.subtitle}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={status === 'authenticated' ? '/feed' : '/login'}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              {copy.ctaPrimary}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#wtt-arch"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
            >
              {copy.ctaSecondary}
            </a>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300">
            {copy.trust.map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-14">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-indigo-200/90">{copy.sectionFeature}</p>
          <h2 className="mb-5 text-2xl font-semibold text-white">{copy.sectionFeatureTitle}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[Lock, Workflow, Radar].map((Icon, i) => (
              <article key={copy.featureCards[i].title} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <Icon className="mb-3 h-5 w-5 text-indigo-300" />
                <h3 className="mb-2 text-base font-semibold text-white">{copy.featureCards[i].title}</h3>
                <p className="text-sm leading-6 text-slate-300">{copy.featureCards[i].desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="wtt-arch" className="mb-14 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-indigo-200/90">{copy.sectionArch}</p>
          <h2 className="mb-6 text-2xl font-semibold text-white">{copy.sectionArchTitle}</h2>
          <div className="grid gap-3 md:grid-cols-4">
            {copy.archNodes.map((n, idx) => (
              <div key={n.title} className="relative rounded-xl border border-white/10 bg-slate-900/40 p-4">
                <div className="mb-2 inline-flex rounded-lg bg-indigo-500/20 px-2 py-1 text-[11px] text-indigo-200">{n.title}</div>
                <p className="text-sm text-slate-300">{n.desc}</p>
                {idx < copy.archNodes.length - 1 && (
                  <Cable className="absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-indigo-300/80 md:block" />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-14 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-indigo-200/90">{copy.sectionFlow}</p>
            <h3 className="mb-4 text-xl font-semibold text-white">{copy.sectionFlowTitle}</h3>
            <div className="space-y-3">
              {copy.flow.map((f) => (
                <div key={f.step} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="mb-1 text-xs text-indigo-200">STEP {f.step}</p>
                  <p className="font-medium text-white">{f.title}</p>
                  <p className="mt-1 text-sm text-slate-300">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-indigo-200/90">{copy.sectionCapability}</p>
            <h3 className="mb-4 text-xl font-semibold text-white">WTT Capability</h3>
            <div className="grid gap-2">
              {copy.capabilities.map((c) => (
                <div key={c} className="flex items-start gap-2 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-indigo-300/30 bg-indigo-500/10 p-6 text-center">
          <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-400/20">
            <Blocks className="h-5 w-5 text-indigo-200" />
          </div>
          <h3 className="text-xl font-semibold text-white">{copy.finalTitle}</h3>
          <p className="mx-auto mt-2 max-w-3xl text-sm leading-6 text-slate-200">{copy.finalDesc}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href={status === 'authenticated' ? '/feed' : '/login'}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              {copy.ctaPrimary}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-5 py-2.5 text-sm text-white/90 transition hover:bg-white/10"
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
