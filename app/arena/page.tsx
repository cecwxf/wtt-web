import Link from 'next/link'
import { ArenaNav } from '@/components/arena/arena-nav'
import { listChallenges } from '@/lib/arena/store'
import { getArenaSection, sectionStats } from '@/lib/arena/sections'
import { arenaSkillFlows } from '@/lib/arena/skill-flows'

const interviewSectionSlugs = [
  'ai-interview',
  'linux-kernel-interview',
  'android-interview',
  'programming-interview',
  'hardware-interview',
  'ai-infra-interview',
]

function sectionCard(slug: string) {
  return getArenaSection(slug)
}

export default function ArenaPage() {
  const challenges = listChallenges()
  const education = getArenaSection('education')
  const interviewSections = interviewSectionSlugs.map(sectionCard).filter(Boolean)
  const educationCount = sectionStats(challenges, 'education').total
  const interviewCount = interviewSections.reduce((sum, section) => sum + sectionStats(challenges, section!.slug).total, 0)
  const educationFlows = arenaSkillFlows.filter((flow) => flow.domain === 'education')
  const interviewFlows = arenaSkillFlows.filter((flow) => flow.domain === 'interview')

  return (
    <main className="min-h-[100dvh] bg-[#f7f5f0] text-slate-950 dark:bg-[#151515] dark:text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-12rem] top-[-18rem] h-[36rem] w-[36rem] rounded-full bg-amber-200/30 blur-3xl dark:bg-amber-300/10" />
        <div className="absolute right-[-10rem] top-[-12rem] h-[32rem] w-[32rem] rounded-full bg-[#3ce8e2]/20 blur-3xl dark:bg-[#3ce8e2]/10" />
        <div className="absolute bottom-[-18rem] left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
      </div>

      <section className="relative mx-auto max-w-7xl px-3 py-6 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
        <ArenaNav
          title="WTT Arena"
          subtitle="教育与面试训练"
          right={(
            <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-500 dark:text-gray-400">
              <a href="#education" className="transition-colors hover:text-[#008f8f] dark:hover:text-[#3ce8e2]">教育</a>
              <a href="#interview" className="transition-colors hover:text-[#008f8f] dark:hover:text-[#3ce8e2]">面试</a>
              <Link href="/arena/learning" className="transition-colors hover:text-[#008f8f] dark:hover:text-[#3ce8e2]">学习档案</Link>
              <Link href="/feed" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm transition hover:border-[#3ce8e2] hover:text-[#008f8f] dark:border-gray-800 dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:text-[#3ce8e2]">返回 Feed</Link>
            </div>
          )}
        />

        <header className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b] sm:p-8 lg:p-10">
            <div className="mb-6 inline-flex rounded-full border border-[#3ce8e2]/25 bg-[#3ce8e2]/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-[#008f8f] dark:text-[#3ce8e2]">
              Skill Coach · Practice · Review
            </div>
            <h1 className="max-w-4xl text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">
              简单进入练习，让 Agent 帮你学会题、练好面试。
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-gray-400">
              Arena 现在聚焦两件事：教育题目讲解和面试问答训练。选择板块后直接进入题目，使用提示、讲答案、类题迁移三类 Coach Action 推动学习闭环。
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link href="/arena/sections/education" className="group rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:-translate-y-1 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-400/20 dark:bg-amber-400/10 dark:hover:bg-amber-400/15">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700 dark:text-amber-200">Education</p>
                <h2 className="mt-3 text-2xl font-black">教育练习</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-300">小学、初中、高中学科题，按错题复盘和分步讲解组织。</p>
                <p className="mt-5 text-sm font-black text-amber-700 dark:text-amber-200">{educationCount} 个练习入口 →</p>
              </Link>
              <Link href="/arena/sections/ai-interview" className="group rounded-2xl border border-violet-200 bg-violet-50 p-5 transition hover:-translate-y-1 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-400/20 dark:bg-violet-400/10 dark:hover:bg-violet-400/15">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-700 dark:text-violet-200">Interview</p>
                <h2 className="mt-3 text-2xl font-black">面试训练</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-300">AI、系统、Android、Linux、硬件等开放式面试问答。</p>
                <p className="mt-5 text-sm font-black text-violet-700 dark:text-violet-200">{interviewCount} 个面试题 →</p>
              </Link>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b]">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#008f8f] dark:text-[#3ce8e2]">Action Status</p>
            <h2 className="mt-3 text-2xl font-black">当前保留的核心动作</h2>
            <div className="mt-5 space-y-3">
              {['提示：先追问和点拨，不直接倒答案', '讲答案：分步讲解、公式和关键误区', '类题迁移：生成下一题和迁移方向'].map((item, index) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-gray-800 dark:bg-[#151515] dark:text-gray-300">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#3ce8e2]/15 text-xs font-black text-[#008f8f] dark:text-[#3ce8e2]">{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </header>

        <section id="education" className="mt-10 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-amber-600 dark:text-amber-300">Education Flow</p>
            <h2 className="mt-2 text-3xl font-black">教育板块</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-gray-400">
              {education?.descriptionZh || '按学习动作进入练习，避免在首页铺开过多学科入口。'}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {educationFlows.map((flow) => (
              <SkillFlowCard key={flow.id} flow={flow} compact />
            ))}
          </div>
        </section>

        <section id="interview" className="mt-12 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">Interview Flow</p>
            <h2 className="mt-2 text-3xl font-black">面试板块</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-gray-400">选择一个领域后直接进入开放式问答。Agent 会按候选人回答评分、补强答案并继续追问。</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {interviewSections.map((section) => section && (
              <Link key={section.slug} href={section.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 dark:border-gray-800 dark:bg-[#1b1b1b]">
                <div className={`mb-4 h-1.5 w-20 rounded-full bg-gradient-to-r ${section.accent}`} />
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-gray-500">{section.eyebrow}</p>
                <h3 className="mt-3 text-xl font-black">{section.titleZh}</h3>
                <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-600 dark:text-gray-400">{section.descriptionZh}</p>
                <p className="mt-4 text-sm font-black text-violet-700 dark:text-violet-200">开始面试 →</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b]">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">Interview Actions</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {interviewFlows.map((flow) => (
              <SkillFlowCard key={flow.id} flow={flow} compact />
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

function SkillFlowCard({ flow, compact = false }: { flow: (typeof arenaSkillFlows)[number]; compact?: boolean }) {
  return (
    <Link href={flow.href} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-[#3ce8e2]/50 dark:border-gray-800 dark:bg-[#1b1b1b]">
      <div className={`h-1.5 bg-gradient-to-r ${flow.accent}`} />
      <div className="p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-gray-500">{flow.domain === 'education' ? 'Education Action' : 'Interview Action'}</p>
        <h3 className="mt-3 text-xl font-black text-slate-950 dark:text-white">{flow.title}</h3>
        <p className={`mt-2 text-sm leading-6 text-slate-600 dark:text-gray-400 ${compact ? '' : 'min-h-[48px]'}`}>{flow.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {flow.steps.map((step, index) => (
            <span key={step} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-gray-800 dark:bg-[#151515] dark:text-gray-300">{index + 1}. {step}</span>
          ))}
        </div>
      </div>
    </Link>
  )
}
