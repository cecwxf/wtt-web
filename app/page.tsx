'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  GraduationCap,
  MessageSquareText,
  PenTool,
  Sparkles,
  Trophy,
  UsersRound,
  Workflow,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n-provider'
import { WttLogo } from '@/components/ui/wtt-logo'

const arenaTracks = [
  {
    href: '/arena/sections/technology',
    zhTitle: '技术面试训练',
    enTitle: 'Technical Interview Training',
    zhDesc: '系统设计、AI Infra、算法、操作系统、数据库、网络、编译器与工程实践题库。',
    enDesc: 'System design, AI infra, algorithms, OS, databases, networking, compilers, and engineering practice.',
    icon: BrainCircuit,
  },
  {
    href: '/arena/sections/education',
    zhTitle: '教育学科训练',
    enTitle: 'Education Boards',
    zhDesc: '小学、初中、高中分阶段组织学科题；用 Arena Coach 做启发式讲解与白板推导。',
    enDesc: 'Stage-based subject practice for primary, middle, and high school with Arena Coach and whiteboard reasoning.',
    icon: GraduationCap,
  },
  {
    href: '/arena',
    zhTitle: 'Arena 题库大厅',
    enTitle: 'Arena Challenge Hub',
    zhDesc: '按板块浏览题目，进入后可直接和 Agent 对话、生成白板、练习结构化表达。',
    enDesc: 'Browse challenges by section, chat with the Agent, generate whiteboards, and practice structured answers.',
    icon: Trophy,
  },
]

export default function Home() {
  const { status } = useSession()
  const { locale, setLocale } = useI18n()
  const zh = locale === 'zh'
  const consoleHref = status === 'authenticated' ? '/feed' : '/login'

  const features = [
    {
      icon: MessageSquareText,
      title: zh ? 'Arena Chat 面试陪练' : 'Arena Chat Coach',
      desc: zh
        ? '每道题右侧都有固定 Arena Coach，支持苏格拉底追问、面试回答点评、直接 Ask 问答。'
        : 'Each challenge has a dedicated Arena Coach for Socratic hints, interview critique, and direct Q&A.',
    },
    {
      icon: PenTool,
      title: zh ? '白板讲解与过程图' : 'Whiteboard Reasoning',
      desc: zh
        ? '把公式、原理、架构和流程画成 Mermaid 白板；适合 Transformer、系统设计、物理公式、算法推导等原理讲解。'
        : 'Render formulas, principles, architecture, and process flows as Mermaid whiteboards for deep explanations.',
    },
    {
      icon: Workflow,
      title: zh ? '结构化训练闭环' : 'Structured Practice Loop',
      desc: zh
        ? '题目、对话、白板、阶段状态、掌握度和下一题迁移形成闭环，不只是刷题。'
        : 'Challenges, chat, whiteboard, stage state, mastery estimate, and transfer practice form a real learning loop.',
    },
    {
      icon: UsersRound,
      title: zh ? '适合老师、学生和求职者' : 'For Teachers, Students, and Candidates',
      desc: zh
        ? '既能做技术面试模拟，也能做学科题讲解、错题追问和知识点迁移。'
        : 'Use it for technical interview mock practice, subject tutoring, mistake review, and concept transfer.',
    },
  ]

  const interviewTopics = [
    zh ? 'AI Infra / RAG / LLM Serving' : 'AI Infra / RAG / LLM Serving',
    zh ? '系统设计与架构权衡' : 'System design and trade-offs',
    zh ? '算法、数据结构、复杂度' : 'Algorithms, data structures, complexity',
    zh ? 'OS / 网络 / 数据库 / 编译器' : 'OS / networking / databases / compilers',
  ]

  const educationTopics = [
    zh ? '小学：基础概念与表达训练' : 'Primary: fundamentals and expression',
    zh ? '初中：知识点拆解与错题讲解' : 'Middle school: concept breakdown and mistake review',
    zh ? '高中：公式推导、物理过程、数学证明' : 'High school: derivations, physics processes, and proofs',
    zh ? '高考志愿 Ask 咨询板块' : 'Gaokao volunteer Ask consultation',
  ]

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4efe4] text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(20,184,166,0.18),transparent_32%),radial-gradient(circle_at_82%_0%,rgba(245,158,11,0.20),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.04),transparent_45%)]" />
      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-6 sm:px-8">
        <header className="mb-14 flex items-center justify-between rounded-3xl border border-slate-900/10 bg-white/80 px-5 py-3 shadow-sm backdrop-blur">
          <Link href="/" className="flex items-center gap-2 text-sm font-black text-slate-900">
            <WttLogo size={22} className="ring-1 ring-slate-300/80" />
            <span>WTT</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/arena" className="hidden text-sm font-bold text-slate-700 hover:text-teal-700 sm:inline">
              Arena
            </Link>
            <Link href="/arena/sections/technology" className="hidden text-sm text-slate-600 hover:text-slate-950 md:inline">
              {zh ? '技术面试' : 'Interview'}
            </Link>
            <Link href="/arena/sections/education" className="hidden text-sm text-slate-600 hover:text-slate-950 md:inline">
              {zh ? '教育板块' : 'Education'}
            </Link>
            <button
              type="button"
              onClick={() => setLocale(zh ? 'en' : 'zh')}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:border-slate-400"
            >
              {zh ? 'EN' : '中文'}
            </button>
            <Link href={consoleHref} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800">
              {status === 'authenticated' ? (zh ? '进入工作台' : 'Console') : (zh ? '登录' : 'Login')}
            </Link>
          </nav>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-teal-700">
              WTT Arena
            </p>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-7xl">
              {zh ? '用 Agent 练技术面试，也用白板讲透每一道题。' : 'Practice interviews with agents. Explain every problem on a whiteboard.'}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-650">
              {zh
                ? 'wtt.sh 首页现在重点介绍 Arena：技术面试训练、教育学科训练、Arena Chat、公式/原理白板和阶段化学习闭环。'
                : 'wtt.sh now focuses on Arena: technical interview practice, education boards, Arena Chat, formula/principle whiteboards, and staged learning loops.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/arena" className="inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-teal-600/20 hover:bg-teal-500">
                {zh ? '进入 Arena' : 'Open Arena'}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/arena/sections/technology" className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:border-slate-500">
                {zh ? '技术面试题库' : 'Interview Tracks'}
              </Link>
              <Link href="/arena/sections/education" className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:border-slate-500">
                {zh ? '教育学科板块' : 'Education Boards'}
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-900 bg-slate-950 p-4 text-white shadow-2xl shadow-slate-950/20">
            <div className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,#0f172a,#082f2d_55%,#451a03)] p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-200">Live Arena</p>
                  <h2 className="mt-1 text-2xl font-black">{zh ? '题目 + Chat + 白板' : 'Problem + Chat + Whiteboard'}</h2>
                </div>
                <Sparkles className="h-6 w-6 text-amber-200" />
              </div>
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-black text-teal-100">{zh ? 'Arena Coach' : 'Arena Coach'}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-100">
                    {zh ? '“先说你的思路，我会追问瓶颈、评分并补全更强答案。”' : '"Share your thinking first. I will probe, score, and improve the answer."'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-black text-amber-100">{zh ? '白板图解' : 'Whiteboard'}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-950">
                    <span className="rounded-xl bg-blue-100 px-2 py-3">{zh ? '输入' : 'Input'}</span>
                    <span className="rounded-xl bg-violet-100 px-2 py-3">{zh ? '变换' : 'Transform'}</span>
                    <span className="rounded-xl bg-emerald-100 px-2 py-3">{zh ? '结论' : 'Result'}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-black text-slate-200">{zh ? '阶段闭环' : 'Learning loop'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {(zh ? ['诊断', '提示', '作答', '点评', '迁移'] : ['Diagnose', 'Hint', 'Answer', 'Review', 'Transfer']).map((item) => (
                      <span key={item} className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-slate-100">{item}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {arenaTracks.map((track) => (
            <Link key={track.href} href={track.href} className="group rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm transition hover:-translate-y-1 hover:border-teal-300 hover:shadow-xl hover:shadow-teal-900/10">
              <track.icon className="mb-5 h-7 w-7 text-teal-700" />
              <h2 className="text-xl font-black tracking-tight text-slate-950">{zh ? track.zhTitle : track.enTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{zh ? track.zhDesc : track.enDesc}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-teal-700">
                {zh ? '进入板块' : 'Open track'}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-20">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{zh ? '核心体验' : 'Core Experience'}</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                {zh ? 'Arena 不是普通题库，是会对话的训练场。' : 'Arena is not a static question bank. It talks back.'}
              </h2>
            </div>
            <Link href="/arena" className="inline-flex items-center gap-2 text-sm font-black text-teal-700 hover:text-teal-600">
              {zh ? '查看全部 Arena 题目' : 'View all Arena challenges'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-3xl border border-slate-200 bg-white p-5">
                <feature.icon className="mb-4 h-6 w-6 text-amber-600" />
                <h3 className="text-base font-black text-slate-950">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{feature.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-slate-200 bg-white p-7">
            <div className="mb-5 flex items-center gap-3">
              <BrainCircuit className="h-7 w-7 text-teal-700" />
              <h2 className="text-2xl font-black tracking-tight">{zh ? '技术面试重点' : 'Interview Focus'}</h2>
            </div>
            <p className="text-sm leading-7 text-slate-600">
              {zh
                ? '面向求职和晋升场景，强调“怎么表达、怎么权衡、怎么验证”，不只给标准答案。'
                : 'Built for hiring and promotion loops, with emphasis on expression, trade-offs, and validation rather than canned answers.'}
            </p>
            <div className="mt-5 grid gap-3">
              {interviewTopics.map((topic) => (
                <div key={topic} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  {topic}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-slate-200 bg-white p-7">
            <div className="mb-5 flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-amber-600" />
              <h2 className="text-2xl font-black tracking-tight">{zh ? '教育板块重点' : 'Education Focus'}</h2>
            </div>
            <p className="text-sm leading-7 text-slate-600">
              {zh
                ? '教育板块按阶段和学科组织，适合讲题、错题复盘、公式推导、过程图解释和个性化追问。'
                : 'Education boards are organized by stage and subject for tutoring, mistake review, derivations, process diagrams, and personalized follow-up.'}
            </p>
            <div className="mt-5 grid gap-3">
              {educationTopics.map((topic) => (
                <div key={topic} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-amber-600" />
                  {topic}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-20 rounded-[2rem] border border-slate-900 bg-slate-950 p-8 text-center text-white">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-200">Start</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-black tracking-tight">
            {zh ? '从一道题开始，让 Agent 帮你把思路讲清楚。' : 'Start from one problem. Let the Agent clarify your reasoning.'}
          </h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/arena" className="inline-flex items-center gap-2 rounded-2xl bg-teal-500 px-6 py-3 text-sm font-black text-slate-950 hover:bg-teal-400">
              {zh ? '进入 Arena' : 'Open Arena'}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={consoleHref} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-black text-white hover:bg-white/15">
              {status === 'authenticated' ? (zh ? '进入工作台' : 'Open Console') : (zh ? '登录后保存进度' : 'Login to save progress')}
            </Link>
          </div>
        </section>

        <footer className="mt-12 text-center text-xs text-slate-500">
          WTT · {zh ? 'Arena 技术面试与教育训练平台' : 'Arena for technical interviews and education'}
        </footer>
      </div>
    </main>
  )
}
