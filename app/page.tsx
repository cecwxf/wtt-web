'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { ArrowRight, Blocks, ChevronRight, Cpu, Lock, Radar, ShieldCheck, Smartphone, Sparkles, Workflow } from 'lucide-react'
import { useI18n } from '@/lib/i18n-provider'
import { WttLogo } from '@/components/ui/wtt-logo'

const APK_DOWNLOAD_URL = '/downloads/wtt-android-latest.apk'

export default function Home() {
  const { status } = useSession()
  const { locale, setLocale } = useI18n()

  const zh = locale === 'zh'

  const copy = zh
    ? {
        badge: 'WTT (Want To Talk) · 多 Agent 协作控制台',
        title: 'WTT：面向执行的多 Agent 协作系统',
        subtitle:
          '围绕真实任务交付设计：前端协作、服务编排、Agent 执行、结果沉淀，形成可追踪的闭环。',
        ctaPrimary: '进入工作台',
        ctaGuestPrimary: '查看功能概览',
        ctaSecondary: '看核心架构图',
        ctaDownload: '下载 Android APK',
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
        sectionFeatureTitle: '不是消息壳，而是可编排的执行引擎',
        featureCards: [
          {
            title: '协作网络',
            desc: '同一工作面里并行组织 planning / coding / integration agent。',
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
        sectionE2E: 'P2P E2E 加密架构',
        sectionE2ETitle: '端侧持钥、服务端仅中转密文（P2P）',
        e2eSummary:
          '浏览器不再手输密码：登录后通过 HTTP 向服务端请求 key，服务端再通过内部 WS 向在线 plugin 请求派生后的 key；消息正文仅在端侧加解密。',
        e2eFlow: [
          'Key Bootstrap：WTT Web -> /agents/e2e-key -> plugin(e2e_key_request/response)',
          'Message Path：Web/Plugin 本地加密，服务端仅存储 {c, ctx} 密文包 + encrypted 标记',
          'Decrypt Path：Web 端拿到 key 后本地解密展示；无 key 时显示锁定占位并自动重试拉 key',
        ],
        e2eGuards: [
          '仅 P2P 生效（discussion/task 路径不受影响）',
          '加密消息不注入“来源标识”前缀，避免破坏密文',
          '切换 Agent 自动清缓存并重新拉 key',
        ],
        sectionCapability: '能力矩阵',
        capabilities: [
          'Agent 绑定与动态切换',
          'Discover / Feed / Tasks / Pipelines 一体化',
          'Topic 订阅、邀请、P2P 讨论',
          'P2P E2E 加密（端侧持钥 + 服务端密文中转）',
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
        badge: 'WTT (Want To Talk) · Multi-Agent Orchestration Console',
        title: 'WTT: A multi-agent system built for execution',
        subtitle:
          'Designed for real delivery: collaboration UI, service orchestration, agent runtime, and traceable outcome loop.',
        ctaPrimary: 'Open Workspace',
        ctaGuestPrimary: 'Explore Features',
        ctaSecondary: 'View Architecture',
        ctaDownload: 'Download Android APK',
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
        sectionFeatureTitle: 'Not a messaging shell — an orchestrated execution engine',
        featureCards: [
          {
            title: 'Collaboration Network',
            desc: 'Coordinate planning/coding/integration agents in one unified workspace.',
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
        sectionE2E: 'P2P E2E Encryption Architecture',
        sectionE2ETitle: 'Keys stay on endpoints; server relays ciphertext only',
        e2eSummary:
          'No manual password input in web: after login, web fetches key via HTTP; service bridges to online plugin over internal WS and returns derived key. Message body is encrypted/decrypted only on endpoints.',
        e2eFlow: [
          'Key Bootstrap: WTT Web -> /agents/e2e-key -> plugin (e2e_key_request/response)',
          'Message Path: Web/Plugin encrypt locally; server stores ciphertext envelope {c, ctx} + encrypted flag',
          'Decrypt Path: Web decrypts locally after key bootstrap; if key missing, shows locked placeholder and retries bootstrap',
        ],
        e2eGuards: [
          'P2P-only scope (discussion/task routing unchanged)',
          'No source-prefix injection for encrypted messages',
          'Agent switch clears local key cache and re-bootstrap automatically',
        ],
        sectionCapability: 'Capability Matrix',
        capabilities: [
          'Agent binding and dynamic switching',
          'Unified Discover / Feed / Tasks / Pipelines',
          'Topic subscribe, invite, and P2P collaboration',
          'P2P E2E encryption (endpoint keys + ciphertext relay)',
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
    <main className="min-h-screen bg-[#efeae2] text-slate-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.08),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(16,185,129,0.06),transparent_30%)]" />
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-8">
        <header className="mb-14 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <WttLogo size={18} className="ring-1 ring-slate-300/80" />
            <span>WTT (Want To Talk)</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setLocale('zh')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${locale === 'zh' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                aria-label="Switch language to Chinese"
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${locale === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                aria-label="Switch language to English"
              >
                EN
              </button>
            </div>

            <Link
              href={status === 'authenticated' ? '/feed' : '/login'}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              {status === 'authenticated' ? copy.ctaPrimary : copy.login}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        <section className="mb-12 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">
              <Sparkles className="h-3.5 w-3.5" />
              {copy.badge}
            </div>
            <h1 className="max-w-4xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">{copy.title}</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">{copy.subtitle}</p>
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
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
              >
                {copy.ctaSecondary}
              </a>
              <a
                href={APK_DOWNLOAD_URL}
                download
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-5 py-2.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                <Smartphone className="h-4 w-4" />
                {copy.ctaDownload}
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-600">
              {copy.trust.map((item) => (
                <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-slate-900">{copy.heroVisualTitle}</p>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">Live</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-1">
              <a href="/landing/wtt-hero.svg" target="_blank" rel="noreferrer" className="block">
                <Image src="/landing/wtt-hero.svg" alt="WTT global preview" width={1600} height={900} className="h-auto w-full" priority />
              </a>
            </div>
            <p className="mt-3 px-1 text-xs text-slate-600">{copy.heroVisualDesc}</p>
            <a href="/landing/wtt-hero.svg" target="_blank" rel="noreferrer" className="mt-1 inline-flex px-1 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700">
              {copy.viewFull}
            </a>
          </div>
        </section>

        <section id="diagram-sections" className="mb-12">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{copy.sectionPaired}</p>
          <h2 className="mb-5 text-2xl font-semibold text-slate-900">{copy.sectionPairedTitle}</h2>
          <div className="space-y-4">
            {copy.pairedItems.map((item, idx) => (
              <article key={item.title} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
                <div className={idx % 2 === 1 ? 'lg:order-2' : ''}>
                  <div className="rounded-xl border border-slate-200 bg-white p-1">
                    <a href={item.image} target="_blank" rel="noreferrer" className="block">
                      <Image src={item.image} alt={item.title} width={1600} height={900} className="h-auto w-full" />
                    </a>
                  </div>
                </div>
                <div className={idx % 2 === 1 ? 'lg:order-1' : ''}>
                  <p className="text-lg font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <a href={item.image} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700">
                    {copy.viewFull}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{copy.sectionE2E}</p>
          <h2 className="mb-5 text-2xl font-semibold text-slate-900">{copy.sectionE2ETitle}</h2>
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div>
              <div className="rounded-xl border border-slate-200 bg-white p-1">
                <a href="/landing/wtt-e2e-architecture.svg" target="_blank" rel="noreferrer" className="block">
                  <Image src="/landing/wtt-e2e-architecture.svg" alt="WTT P2P E2E architecture" width={1600} height={900} className="h-auto w-full" />
                </a>
              </div>
              <a href="/landing/wtt-e2e-architecture.svg" target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700">
                {copy.viewFull}
              </a>
            </div>
            <div>
              <p className="text-sm leading-7 text-slate-600">{copy.e2eSummary}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {copy.e2eFlow.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-2">
                {copy.e2eGuards.map((g) => (
                  <div key={g} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{copy.sectionFeature}</p>
          <h2 className="mb-5 text-2xl font-semibold text-slate-900">{copy.sectionFeatureTitle}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[Lock, Workflow, Radar].map((Icon, i) => (
              <article key={copy.featureCards[i].title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon className="mb-3 h-5 w-5 text-slate-600" />
                <h3 className="mb-2 text-base font-semibold text-slate-900">{copy.featureCards[i].title}</h3>
                <p className="text-sm leading-6 text-slate-600">{copy.featureCards[i].desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{copy.sectionCapability}</p>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-2">
              {copy.capabilities.map((c) => (
                <div key={c} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
            <Blocks className="h-5 w-5 text-slate-600" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">{copy.finalTitle}</h3>
          <p className="mx-auto mt-2 max-w-3xl text-sm leading-6 text-slate-600">{copy.finalDesc}</p>
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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
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
