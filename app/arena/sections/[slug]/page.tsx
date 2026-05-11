import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listChallenges } from '@/lib/arena/store'
import { challengesForSection, getArenaSection, sectionStats } from '@/lib/arena/sections'

function difficultyTone(difficulty: string) {
  if (difficulty === 'easy') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (difficulty === 'medium') return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
  return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
}

function typeLabel(type: string) {
  if (type === 'qa') return 'Interview'
  if (type === 'project') return 'Project'
  return 'Judge'
}

export default function ArenaSectionPage({ params }: { params: { slug: string } }) {
  const section = getArenaSection(params.slug)
  if (!section) notFound()

  const challenges = listChallenges()
  const rows = challengesForSection(challenges, section.slug)
  const stats = sectionStats(challenges, section.slug)

  return (
    <main className="min-h-screen bg-[#151515] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-[-18rem] h-[34rem] w-[34rem] rounded-full bg-[#3ce8e2]/10 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-12rem] h-[32rem] w-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/arena" className="bg-gradient-to-r from-[#3ce8e2] to-[#00b3b3] bg-clip-text text-2xl font-black text-transparent">WTT Arena</Link>
            <span className="text-gray-700">/</span>
            <span className="text-sm font-bold text-gray-400">{section.titleZh}</span>
          </div>
          <Link href="/arena" className="rounded-md border border-gray-800 bg-[#1e1e1e] px-4 py-2 text-sm font-bold text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">返回板块</Link>
        </nav>

        <header className="mb-10 overflow-hidden rounded-3xl border border-gray-800 bg-[#1b1b1b] p-8">
          <div className={`mb-6 h-1.5 w-28 rounded-full bg-gradient-to-r ${section.accent}`} />
          <p className="text-xs font-black uppercase tracking-[0.26em] text-[#3ce8e2]">{section.eyebrow}</p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">{section.titleZh}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-400">{section.descriptionZh}</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-4"><p className="text-2xl font-black text-white">{stats.total}</p><p className="text-gray-500">题目</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-4"><p className="text-2xl font-black text-emerald-300">{stats.easy}</p><p className="text-gray-500">Easy</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-4"><p className="text-2xl font-black text-yellow-300">{stats.medium}</p><p className="text-gray-500">Medium</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-4"><p className="text-2xl font-black text-rose-300">{stats.hard}</p><p className="text-gray-500">Hard</p></div>
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <section className="overflow-hidden rounded-xl border border-gray-800 bg-[#1e1e1e]">
            <div className="grid grid-cols-[1fr_120px_120px_120px] border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <span>Problem</span>
              <span>Type</span>
              <span>Difficulty</span>
              <span className="text-right">Action</span>
            </div>
            {rows.map((challenge, index) => (
              <Link key={challenge.id} href={`/arena/challenges/${challenge.slug}`} className="group grid grid-cols-[1fr_120px_120px_120px] items-center border-b border-gray-800/70 px-5 py-4 transition-colors last:border-b-0 hover:bg-[#252525]">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-gray-500">{String(index + 1).padStart(2, '0')}</span>
                    <h3 className="truncate text-base font-bold text-white group-hover:text-[#3ce8e2]">{challenge.title}</h3>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 pl-9">
                    {challenge.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded bg-[#151515] px-2 py-0.5 text-xs text-gray-400">{tag}</span>)}
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-300">{typeLabel(challenge.challenge_type)}</span>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${difficultyTone(challenge.difficulty)}`}>{challenge.difficulty}</span>
                <span className="text-right text-sm font-semibold text-[#3ce8e2]">进入 →</span>
              </Link>
            ))}
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
              <h2 className="font-black text-white">来源参考</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">题面按 WTT Arena 口径重写，板块选题参考以下公开来源方向。</p>
              <div className="mt-4 space-y-2">
                {section.sources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-800 bg-[#151515] px-3 py-2 text-sm text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">
                    {source.label} ↗
                  </a>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
              <h2 className="font-black text-white">使用方式</h2>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-400">
                <li>• Judge 题：进入后可用 Python/C/C++ 提交给 Agent Runner。</li>
                <li>• Interview 题：进入后直接用右侧 Arena Coach 做多轮模拟面试。</li>
                <li>• 隐藏测试和上下文注入仍保持脱敏。</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
